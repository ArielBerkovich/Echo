package io.jenkins.plugins.echo;

import com.cloudbees.plugins.credentials.CredentialsProvider;
import com.cloudbees.plugins.credentials.common.StandardListBoxModel;
import com.cloudbees.plugins.credentials.domains.DomainRequirement;
import hudson.Extension;
import hudson.Util;
import hudson.security.ACL;
import hudson.util.ListBoxModel;
import java.util.Collections;
import jenkins.model.GlobalConfiguration;
import jenkins.model.Jenkins;
import org.jenkinsci.plugins.plaincredentials.StringCredentials;

/** Global defaults shared by all echoSend Pipeline steps. */
@Extension
public class EchoNotifierConfiguration extends GlobalConfiguration {
  private String serverUrl;
  private String credentialId;

  public EchoNotifierConfiguration() {
    load();
  }

  public static EchoNotifierConfiguration get() {
    return GlobalConfiguration.all().get(EchoNotifierConfiguration.class);
  }

  public String getServerUrl() { return serverUrl; }
  public String getCredentialId() { return credentialId; }

  public void setServerUrl(String value) {
    serverUrl = Util.fixEmpty(value);
    save();
  }

  public void setCredentialId(String value) {
    credentialId = Util.fixEmpty(value);
    save();
  }

  public ListBoxModel doFillCredentialIdItems() {
    return new StandardListBoxModel()
        .withEmptySelection()
        .withAll(CredentialsProvider.lookupCredentials(
            StringCredentials.class, Jenkins.get(), ACL.SYSTEM,
            Collections.<DomainRequirement>emptyList()));
  }
}
