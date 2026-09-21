const { removeCachedInvite } = require("../../Utils/Membership/inviteTracker");

module.exports = {
  name: "inviteDelete",
  execute(invite) {
    removeCachedInvite(invite);
  }
};
