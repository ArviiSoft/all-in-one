const { updateCachedInvite } = require("../../Utils/Membership/inviteTracker");

module.exports = {
  name: "inviteCreate",
  execute(invite) {
    updateCachedInvite(invite);
  }
};
