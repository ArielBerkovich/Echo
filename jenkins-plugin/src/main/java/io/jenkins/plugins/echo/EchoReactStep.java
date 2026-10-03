package io.jenkins.plugins.echo;

import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import com.cloudbees.plugins.credentials.CredentialsMatchers;
import com.cloudbees.plugins.credentials.CredentialsProvider;
import com.cloudbees.plugins.credentials.domains.DomainRequirement;
import hudson.Extension;
import hudson.Util;
import hudson.model.TaskListener;
import hudson.security.ACL;
import java.io.IOException;
import java.io.Serializable;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import jenkins.model.Jenkins;
import net.sf.json.JSONObject;
import org.jenkinsci.plugins.plaincredentials.StringCredentials;
import org.jenkinsci.plugins.workflow.steps.AbstractStepDescriptorImpl;
import org.jenkinsci.plugins.workflow.steps.AbstractStepImpl;
import org.jenkinsci.plugins.workflow.steps.AbstractSynchronousNonBlockingStepExecution;
import org.jenkinsci.plugins.workflow.steps.StepContext;
import org.jenkinsci.plugins.workflow.steps.StepExecution;
import org.kohsuke.stapler.DataBoundConstructor;
import org.kohsuke.stapler.DataBoundSetter;

/** Adds or removes the current user's reaction to an Echo message. */
public class EchoReactStep extends AbstractStepImpl implements Serializable {
  private static final long serialVersionUID = 1L;

  private final String channel;
  private final String messageId;
  private final String emoji;
  private String serverUrl;
  private String credentialId;
  private Boolean present;
  private boolean failOnError;

  @DataBoundConstructor
  public EchoReactStep(String channel, String messageId, String emoji) {
    this.channel = channel;
    this.messageId = messageId;
    this.emoji = emoji;
  }

  public String getChannel() { return channel; }
  public String getMessageId() { return messageId; }
  public String getEmoji() { return emoji; }
  public String getServerUrl() { return serverUrl; }
  public String getCredentialId() { return credentialId; }
  public Boolean getPresent() { return present; }
  public boolean isFailOnError() { return failOnError; }

  @DataBoundSetter public void setServerUrl(String value) { serverUrl = Util.fixEmpty(value); }
  @DataBoundSetter public void setCredentialId(String value) { credentialId = Util.fixEmpty(value); }
  @DataBoundSetter public void setPresent(Boolean value) { present = value; }
  @DataBoundSetter public void setFailOnError(boolean value) { failOnError = value; }

  @Override public StepExecution start(StepContext context) {
    return new EchoReactStepExecution(this, context);
  }

  @Extension
  public static class DescriptorImpl extends AbstractStepDescriptorImpl {
    public DescriptorImpl() { super(EchoReactStepExecution.class); }
    @Override public String getFunctionName() { return "echoReact"; }
    @Override public String getDisplayName() { return "React to an Echo message"; }
  }

  public static class EchoReactStepExecution extends AbstractSynchronousNonBlockingStepExecution<Boolean> {
    private static final long serialVersionUID = 1L;
    private final EchoReactStep step;

    public EchoReactStepExecution(EchoReactStep step, StepContext context) {
      super(context);
      this.step = step;
    }

    @Override protected Boolean run() throws Exception {
      TaskListener listener = getContext().get(TaskListener.class);
      if (Util.fixEmpty(step.channel) == null) throw new IllegalArgumentException("channel is required");
      if (Util.fixEmpty(step.messageId) == null) throw new IllegalArgumentException("messageId is required");
      if (Util.fixEmpty(step.emoji) == null) throw new IllegalArgumentException("emoji is required");

      EchoNotifierConfiguration configuration = EchoNotifierConfiguration.get();
      String serverUrl = step.serverUrl != null ? step.serverUrl : configuration.getServerUrl();
      String credentialId = step.credentialId != null ? step.credentialId : configuration.getCredentialId();
      if (serverUrl == null) throw new IllegalArgumentException("serverUrl is not configured");
      if (credentialId == null) throw new IllegalArgumentException("credentialId is not configured");

      String token = findCredential(credentialId);
      HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
      String channelId;
      try {
        channelId = resolveChannelId(client, serverUrl, token);
      } catch (InterruptedException error) {
        Thread.currentThread().interrupt();
        throw error;
      } catch (Exception error) {
        return handleFailure(listener, error.getMessage() == null ? "Echo channel lookup failed" : error.getMessage());
      }
      Map<String, Object> payload = new LinkedHashMap<>();
      payload.put("emoji", step.emoji);
      if (step.present != null) payload.put("present", step.present);

      String endpoint = trimSlash(serverUrl) + "/api/channels/" + channelId
          + "/messages/" + encodePath(step.messageId) + "/reactions";
      HttpRequest request = HttpRequest.newBuilder()
          .uri(URI.create(endpoint))
          .timeout(Duration.ofSeconds(20))
          .header("Authorization", "Bearer " + token)
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(toJson(payload)))
          .build();
      HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        return handleFailure(listener, "Echo reaction failed (HTTP " + response.statusCode() + "): " + response.body());
      }

      try {
        JSONObject responseBody = JSONObject.fromObject(response.body());
        boolean isPresent = responseBody.getBoolean("present");
        listener.getLogger().println("Echo reaction " + (isPresent ? "set" : "removed") + " on message " + step.messageId);
        return isPresent;
      } catch (RuntimeException error) {
        return handleFailure(listener, "Echo reaction response did not include reaction state");
      }
    }

    private String resolveChannelId(HttpClient client, String serverUrl, String token) throws Exception {
      if (step.channel.matches("(?i)^[a-f0-9]{24}$")) return step.channel;

      String endpoint = trimSlash(serverUrl) + "/api/channels/by-name/" + encodePath(step.channel);
      HttpRequest request = HttpRequest.newBuilder()
          .uri(URI.create(endpoint))
          .timeout(Duration.ofSeconds(20))
          .header("Authorization", "Bearer " + token)
          .GET()
          .build();
      HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        throw new IOException("Echo channel lookup failed (HTTP " + response.statusCode() + "): " + response.body());
      }
      JSONObject responseBody = JSONObject.fromObject(response.body());
      JSONObject channel = responseBody.optJSONObject("channel");
      String channelId = channel == null ? "" : channel.optString("id", "").trim();
      if (!channelId.matches("(?i)^[a-f0-9]{24}$")) {
        throw new IOException("Echo channel lookup response did not include a valid channel id");
      }
      return channelId;
    }

    @SuppressFBWarnings(value = "NP_BOOLEAN_RETURN_NULL", justification = "A failed reaction has no resulting presence state")
    private Boolean handleFailure(TaskListener listener, String message) throws IOException {
      if (step.failOnError) throw new IOException(message);
      listener.error(message);
      return null;
    }

    private String findCredential(String id) {
      StringCredentials credential = CredentialsMatchers.firstOrNull(
          CredentialsProvider.lookupCredentials(StringCredentials.class, Jenkins.get(), ACL.SYSTEM,
              Collections.<DomainRequirement>emptyList()),
          CredentialsMatchers.withId(id));
      if (credential == null) throw new IllegalArgumentException("Echo credential not found: " + id);
      return credential.getSecret().getPlainText();
    }

    private String toJson(Map<String, Object> payload) {
      StringBuilder json = new StringBuilder("{");
      boolean first = true;
      for (Map.Entry<String, Object> item : payload.entrySet()) {
        if (!first) json.append(',');
        first = false;
        json.append('"').append(escapeJson(item.getKey())).append("\":");
        if (item.getValue() instanceof Boolean) json.append(item.getValue());
        else json.append('"').append(escapeJson(String.valueOf(item.getValue()))).append('"');
      }
      return json.append('}').toString();
    }

    private String escapeJson(String value) {
      return value.replace("\\", "\\\\")
          .replace("\"", "\\\"")
          .replace("\r", "\\r")
          .replace("\n", "\\n")
          .replace("\t", "\\t");
    }
  }

  private static String trimSlash(String value) { return value.replaceAll("/+$", ""); }
  private static String encodePath(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
  }
}
