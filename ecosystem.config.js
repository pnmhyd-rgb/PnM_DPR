module.exports = {
  apps: [{
    name: 'rvr-dpr-backend',
    script: 'backend/server.js',
    cwd: '/var/www/rvr-dpr',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '400M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
}
