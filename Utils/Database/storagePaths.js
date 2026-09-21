const STATE_FILE = 'Database/Database State/database-state.json';
const PENDING_DIRECTORY = 'Database/MongoDB/mongodb-pending';
const BACKUP_DIRECTORY = 'Database/MongoDB/Database Backups';

function isInternalDatabasePath(relative) {
  const directory = relative.split('/')[0].toLowerCase();
  return directory === 'mongodb' || directory === 'database state';
}

module.exports = { STATE_FILE, PENDING_DIRECTORY, BACKUP_DIRECTORY, isInternalDatabasePath };
