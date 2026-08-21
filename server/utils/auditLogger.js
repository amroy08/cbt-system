const { AuditLog } = require('../db/database');

async function logEvent(eventType, adminId, details, ipAddress = null) {
  try {
    await AuditLog.create({
      event_type: eventType,
      admin_id: adminId || null,
      details,
      ip_address: ipAddress
    });
  } catch (err) {
    console.error('Audit Log Error:', err);
  }
}

module.exports = {
  logEvent
};
