package io.jenkins.plugins.echo;

import com.cloudbees.plugins.credentials.CredentialsMatchers;
import com.cloudbees.plugins.credentials.CredentialsProvider;
import com.cloudbees.plugins.credentials.common.StandardListBoxModel;
import com.cloudbees.plugins.credentials.domains.DomainRequirement;
import hudson.Extension;
import hudson.Util;
import hudson.model.TaskListener;
import hudson.security.ACL;
import hudson.util.FormValidation;
import hudson.util.ListBoxModel;
import java.io.IOException;
import java.io.Serializable;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import jenkins.model.Jenkins;
import org.jenkinsci.plugins.plaincredentials.StringCredentials;
import org.jenkinsci.plugins.workflow.steps.AbstractStepDescriptorImpl;
import org.jenkinsci.plugins.workflow.steps.AbstractStepImpl;
import org.jenkinsci.plugins.workflow.steps.AbstractSynchronousNonBlockingStepExecution;
import org.jenkinsci.plugins.workflow.steps.StepContext;
import org.jenkinsci.plugins.workflow.steps.StepExecution;
import org.kohsuke.stapler.DataBoundConstructor;
import org.kohsuke.stapler.DataBoundSetter;
import org.kohsuke.stapler.QueryParameter;

/** Sends a structured notification through Echo's existing REST API. */
public class EchoSendStep extends AbstractStepImpl implements Serializable {
  private static final long serialVersionUID = 1L;
  private final String message;
  private String serverUrl;
  private String credentialId;
  private String channel;
  private String recipient;
  private String status;
  private String title;
  private Map<String, String> fields;
  private String idempotencyKey;
  private boolean failOnError;

  @DataBoundConstructor
  public EchoSendStep(String message) {
    this.message = message;
  }

  public String getMessage() { return message; }
  public String getServerUrl() { return serverUrl; }
  public String getCredentialId() { return credentialId; }
  public String getChannel() { return channel; }
  public String getRecipient() { return recipient; }
  public String getStatus() { return status; }
  public String getTitle() { return title; }
  public Map<String, String> getFields() { return fields; }
  public String getIdempotencyKey() { return idempotencyKey; }
  public boolean isFailOnError() { return failOnError; }

  @DataBoundSetter public void setServerUrl(String value) { serverUrl = Util.fixEmpty(value); }
  @DataBoundSetter public void setCredentialId(String value) { credentialId = Util.fixEmpty(value); }
  @DataBoundSetter public void setChannel(String value) { channel = Util.fixEmpty(value); }
  @DataBoundSetter public void setRecipient(String value) { recipient = Util.fixEmpty(value); }
  @DataBoundSetter public void setStatus(String value) { status = Util.fixEmpty(value); }
  @DataBoundSetter public void setTitle(String value) { title = Util.fixEmpty(value); }
  @DataBoundSetter public void setFields(Map<String, String> value) { fields = value; }
  @DataBoundSetter public void setIdempotencyKey(String value) { idempotencyKey = Util.fixEmpty(value); }
  @DataBoundSetter public void setFailOnError(boolean value) { failOnError = value; }

  @Override
  public StepExecution start(StepContext context) {
    return new EchoSendStepExecution(this, context);
  }

  @Extension
  public static class DescriptorImpl extends AbstractStepDescriptorImpl {
    public DescriptorImpl() { super(EchoSendStepExecution.class); }

    @Override public String getFunctionName() { return "echoSend"; }
    @Override public String getDisplayName() { return "Send Echo notification"; }

    public ListBoxModel doFillCredentialIdItems() {
      return new StandardListBoxModel()
          .withEmptySelection()
          .withAll(CredentialsProvider.lookupCredentials(
              StringCredentials.class, Jenkins.get(), ACL.SYSTEM,
              Collections.<DomainRequirement>emptyList()));
    }

    public FormValidation doCheckChannel(@QueryParameter String value) {
      return Util.fixEmpty(value) == null ? FormValidation.ok() : FormValidation.ok();
    }
  }

  public static class EchoSendStepExecution extends AbstractSynchronousNonBlockingStepExecution<Void> {
    private static final long serialVersionUID = 1L;
    private final EchoSendStep step;

    public EchoSendStepExecution(EchoSendStep step, StepContext context) {
      super(context);
      this.step = step;
    }

    @Override protected Void run() throws Exception {
      TaskListener taskListener = getContext().get(TaskListener.class);
      if ((step.channel == null) == (step.recipient == null)) {
        throw new IllegalArgumentException("Exactly one of channel or recipient must be supplied");
      }
      EchoNotifierConfiguration configuration = EchoNotifierConfiguration.get();
      String serverUrl = step.serverUrl != null ? step.serverUrl : configuration.getServerUrl();
      String credentialId = step.credentialId != null ? step.credentialId : configuration.getCredentialId();
      if (serverUrl == null) throw new IllegalArgumentException("serverUrl is not configured");
      if (credentialId == null) throw new IllegalArgumentException("credentialId is not configured");

      String token = findCredential(credentialId);
      String destination = step.recipient != null
          ? "/api/users/" + encodePath(step.recipient) + "/messages"
          : "/api/channels/" + encodePath(step.channel) + "/messages";
      Map<String, Object> payload = new LinkedHashMap<>();
      payload.put("body", renderBody());
      if (step.idempotencyKey != null) payload.put("idempotencyKey", step.idempotencyKey);

      HttpRequest.Builder request = HttpRequest.newBuilder()
          .uri(URI.create(trimSlash(serverUrl) + destination))
          .timeout(Duration.ofSeconds(20))
          .header("Authorization", "Bearer " + token)
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(toJson(payload)));
      if (step.idempotencyKey != null) request.header("Idempotency-Key", step.idempotencyKey);

      HttpResponse<String> response = HttpClient.newBuilder()
          .version(HttpClient.Version.HTTP_1_1)
          .build()
          .send(
          request.build(), HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        String detail = response.body() == null ? "" : response.body();
        String error = "Echo notification failed (HTTP " + response.statusCode() + "): " + detail;
        if (step.failOnError) throw new IOException(error);
        taskListener.error(error);
      } else {
        taskListener.getLogger().println("Echo notification sent to " + (step.recipient != null ? "@" + step.recipient : "#" + step.channel));
      }
      return null;
    }

    private String renderBody() {
      StringBuilder body = new StringBuilder();
      if (step.status != null || step.title != null) {
        body.append("**");
        if (step.status != null) body.append('[').append(step.status.toUpperCase()).append("] ");
        if (step.title != null) body.append(step.title);
        body.append("**\n\n");
      }
      body.append(step.message);
      if (step.fields != null && !step.fields.isEmpty()) {
        for (Map.Entry<String, String> field : step.fields.entrySet()) {
          body.append("\n- **").append(field.getKey()).append(":** ").append(field.getValue());
        }
      }
      return body.toString();
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
      String body = String.valueOf(payload.get("body"));
      StringBuilder json = new StringBuilder("{\"body\":\"");
      json.append(escapeJson(body)).append('"');
      if (payload.containsKey("idempotencyKey")) {
        json.append(",\"idempotencyKey\":\"")
            .append(escapeJson(String.valueOf(payload.get("idempotencyKey"))))
            .append('"');
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
  private static String encodePath(String value) { return value.replace("%", "%25").replace("/", "%2F"); }

}
