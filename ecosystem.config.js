const arvis = [
  {
    name: "ALL In ONE by arviis.",
    namespace: "ArviS",
    script: "arvis.js",
    watch: false,
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    max_memory_restart: "2G",
  },
];

module.exports = { apps: arvis };
