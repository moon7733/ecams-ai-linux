// GitHub 변경을 polling해 내부망 배포 서버로 자동 배포하는 Jenkins 파이프라인
pipeline {
  agent any

  triggers {
    // Tailscale Funnel을 통해 GitHub Webhook을 수신합니다.
    githubPush()
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    DEPLOY_HOST = '192.168.0.21'
    DEPLOY_USER = 'azbrain'
    DEPLOY_DIR = '/home/azbrain/azbrain'
    DEPLOY_PORT = '13000'
    DEPLOY_CREDENTIALS_ID = 'azbrain-deploy-ssh-key'
  }

  stages {
    stage('Deploy') {
      steps {
        withCredentials([sshUserPrivateKey(credentialsId: env.DEPLOY_CREDENTIALS_ID, keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER')]) {
          sh '''
            ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new ${SSH_USER}@${DEPLOY_HOST} "cd ${DEPLOY_DIR} && PREV_HEAD=\\$(git rev-parse HEAD) && git pull --ff-only && ECAMS_HTTP_PORT=${DEPLOY_PORT} bash scripts/deploy.sh \\$PREV_HEAD"
          '''
        }
      }
    }
  }
}
