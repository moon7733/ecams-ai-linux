// GitHub 변경을 polling해 내부망 배포 서버로 자동 배포하는 Jenkins 파이프라인
pipeline {
  agent any

  triggers {
    // GitHub에서 내부망 Jenkins로 webhook이 못 들어오므로 2분마다 SCM 변경을 확인한다.
    pollSCM('H/2 * * * *')
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    DEPLOY_HOST = '192.168.0.11'
    DEPLOY_USER = 'pms'
    DEPLOY_DIR = '/SW2/ecams-ai-linux'
    DEPLOY_PORT = '3000'
    DEPLOY_CREDENTIALS_ID = 'pms-deploy-ssh-key'
  }

  stages {
    stage('Deploy') {
      when {
        allOf {
          branch 'main'
          expression { return env.DEPLOY_ENABLED == null || env.DEPLOY_ENABLED == 'true' }
        }
      }
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
