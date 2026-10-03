package io.jenkins.plugins.echo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.sun.net.httpserver.HttpServer;
import hudson.util.Secret;
import java.io.ByteArrayOutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl;
import org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition;
import org.jenkinsci.plugins.workflow.job.WorkflowJob;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.jvnet.hudson.test.JenkinsRule;
import com.cloudbees.plugins.credentials.CredentialsScope;
import com.cloudbees.plugins.credentials.SystemCredentialsProvider;

/** Runs the Pipeline step inside Jenkins and captures the real HTTP request it sends. */
public class EchoSendStepTest {
  @Rule public JenkinsRule jenkins = new JenkinsRule();

  private HttpServer echo;
  private AtomicReference<String> requestBody;
  private AtomicReference<String> requestPath;
  private AtomicReference<String> authorization;

  @Before public void startEchoEndpoint() throws Exception {
    requestBody = new AtomicReference<>();
    requestPath = new AtomicReference<>();
    authorization = new AtomicReference<>();
    echo = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    echo.createContext("/api/channels/general/messages", exchange -> {
      requestPath.set(exchange.getRequestURI().getPath());
      authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
      ByteArrayOutputStream body = new ByteArrayOutputStream();
      exchange.getRequestBody().transferTo(body);
      requestBody.set(body.toString(StandardCharsets.UTF_8));
      byte[] response = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(201, response.length);
      exchange.getResponseBody().write(response);
      exchange.close();
    });
    echo.start();

    SystemCredentialsProvider.getInstance().getCredentials().add(
        new StringCredentialsImpl(
            CredentialsScope.GLOBAL, "echo-api-token", "Echo API token", Secret.fromString("test-token")));
  }

  @After public void stopEchoEndpoint() {
    if (echo != null) echo.stop(0);
  }

  @Test public void pipelineSendsCardAndMentionToEcho() throws Exception {
    int port = echo.getAddress().getPort();
    WorkflowJob job = jenkins.createProject(WorkflowJob.class, "echo-notification");
    job.setDefinition(new CpsFlowDefinition(
        "echoSend(\n" +
            "  serverUrl: 'http://127.0.0.1:" + port + "',\n" +
            "  credentialId: 'echo-api-token',\n" +
            "  channel: 'general',\n" +
            "  message: 'The deployment is ready.',\n" +
            "  mentions: ['user.c'],\n" +
            "  card: [title: 'Build #42', description: 'Deployment completed.', " +
            "url: 'https://jenkins.example/job/deploy/42/', attributes: [[label: 'Owner', value: 'user.c', type: 'user']]]\n" +
            ")",
        true));

    jenkins.assertBuildStatusSuccess(job.scheduleBuild2(0).get(60, TimeUnit.SECONDS));

    assertEquals("/api/channels/general/messages", requestPath.get());
    assertEquals("Bearer test-token", authorization.get());
    assertTrue(requestBody.get().contains("\"body\":\"The deployment is ready.\\n@user.c\""));
    assertTrue(requestBody.get().contains("\"title\":\"Build #42\""));
    assertTrue(requestBody.get().contains("\"type\":\"user\""));
    assertTrue(requestBody.get().contains("\"value\":\"user.c\""));
  }
}
