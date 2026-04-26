// ecosystem.config.js — PM2 process manager config
// Usage: pm2 start ecosystem.config.js --env production
module.exports = {
  apps: [
    {
      name: 'cornerstone-api',
      script: './backend/server.js',
      instances: 'max',          // Cluster mode — one per CPU core
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      // Restart on crash, not on file change
      watch: false,
      max_memory_restart: '300M',
      // Graceful reload
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 8000,
      // Log rotation
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-error.log',
      out_file:   './logs/pm2-out.log',
      merge_logs: true,
    },
  ],
};
