# Jenkins pipeline notifications

Echo turns the Jenkins Pipeline REST API graph into a focused notification with
the build result, job name, branch, failed stage, the relevant person to
@mention, and a link back to Jenkins.

## 1. Create the Echo destination

In Echo, open the API reference and generate an API token. Create an incoming
webhook for the channel that should receive build reports:

```bash
curl -X POST http://localhost:8090/api/webhooks \
  -H "Authorization: Bearer YOUR_ECHO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Jenkins builds","channelName":"builds"}'
```

Echo returns the raw webhook token once. The Jenkins integration URL is:

```text
http://YOUR_ECHO_HOST/api/integrations/jenkins/RETURNED_WEBHOOK_TOKEN
```

Store that full URL in Jenkins as a **Secret text** credential named
`echo-jenkins-webhook-url`. Do not commit it to the Jenkinsfile.

## 2. Let the job read its own graph

Install/enable Jenkins' **Pipeline REST API** plugin. Create a Jenkins API token
for a user that can read the job, then store the username and token as a
**Username with password** credential named `jenkins-describe-api`.

The job can now read its own `${BUILD_URL}wfapi/describe` endpoint and send that
graph to Echo after its stages finish:

```groovy
import groovy.json.JsonOutput
import groovy.json.JsonSlurperClassic

pipeline {
  agent any

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }
    stage('Build') {
      steps {
        sh './gradlew build'
      }
    }
    stage('Deploy') {
      when {
        branch 'main'
      }
      steps {
        sh './deploy.sh'
      }
    }
  }

  post {
    always {
      script {
        withCredentials([
          usernamePassword(
            credentialsId: 'jenkins-describe-api',
            usernameVariable: 'JENKINS_DESCRIBE_USER',
            passwordVariable: 'JENKINS_DESCRIBE_TOKEN'
          )
        ]) {
          def pipelineJson = sh(
            script: '''
              curl --fail --silent --show-error \
                --user "$JENKINS_DESCRIBE_USER:$JENKINS_DESCRIBE_TOKEN" \
                "${BUILD_URL}wfapi/describe"
            ''',
            returnStdout: true
          ).trim()

          def graph = new JsonSlurperClassic().parseText(pipelineJson)

          def report = [
            jobName: env.JOB_NAME,
            buildNumber: env.BUILD_NUMBER,
            buildUrl: env.BUILD_URL,
            status: currentBuild.currentResult,
            branchName: env.BRANCH_NAME,
            // Set this to the Echo username responsible for this job. It can
            // also come from a parameter, repository map, or commit author.
            relevantPerson: 'ariel',
            pipeline: graph
          ]
          writeFile file: 'echo-jenkins-report.json', text: JsonOutput.toJson(report)
        }

        withCredentials([
          string(credentialsId: 'echo-jenkins-webhook-url', variable: 'ECHO_JENKINS_URL')
        ]) {
          sh '''
            curl --fail --silent --show-error \
              --request POST "$ECHO_JENKINS_URL" \
              --header "Content-Type: application/json" \
              --header "Idempotency-Key: jenkins-${JOB_NAME}-${BUILD_NUMBER}" \
              --data-binary @echo-jenkins-report.json
          '''
        }
      }
    }
  }
}
```

`wfapi/describe` still reports the overall run as `IN_PROGRESS` while the
Declarative `post` block is executing. This is expected. Echo uses
`currentBuild.currentResult` from the report as the authoritative final result,
while the API response supplies the completed stage statuses. The
notification step itself is intentionally not included as a pipeline stage.

The integration uses a stable external key based on job and build number, so a
retry updates the same Echo message instead of creating duplicates.
