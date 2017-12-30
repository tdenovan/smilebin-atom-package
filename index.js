const Smilebin = require('./lib/smilebin')
module.exports = new Smilebin({
  workspace: atom.workspace,
  notificationManager: atom.notifications,
  commandRegistry: atom.commands,
  tooltipManager: atom.tooltips,
  clipboard: atom.clipboard
})
