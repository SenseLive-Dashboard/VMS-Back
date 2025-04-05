const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Check if visitor exists by email or contact
async function findOrCreateVisitor(first_name, last_name, email, contact_number) {
    const query = `
        SELECT visitor_id FROM "VMS".vms_visitors
        WHERE email = $1 OR contact_number = $2
        LIMIT 1
    `;
    const result = await db.query(query, [email, contact_number]);

    if (result.rows.length > 0) {
        return result.rows[0].visitor_id;
    }

    const insertQuery = `
        INSERT INTO "VMS".vms_visitors (visitor_id, first_name, last_name, email, contact_number)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING visitor_id
    `;

    const newVisitorId = uuidv4();
    const insertResult = await db.query(insertQuery, [
        newVisitorId,
        first_name,
        last_name,
        email,
        contact_number
    ]);
    return insertResult.rows[0].visitor_id;
}

// Log a visit
async function logVisit(req, res) {
  try {
    const {
      first_name,
      last_name,
      email,
      contact_number,
      visit_date,
      accompanying_persons,
      department_id,
      visiting_user_id,
      purpose,
      visit_type
    } = req.body;

    const visitor_id = await findOrCreateVisitor(first_name, last_name, email, contact_number);

    const manager_approval = visit_type === 'planned' ? true : null;

    const logQuery = `
      INSERT INTO "VMS".vms_visit_logs (
        visit_id, visitor_id, visit_date, accompanying_persons,
        department_id, visiting_user_id, purpose, visit_type, manager_approval
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
      RETURNING visit_id
    `;

    const visit_id = uuidv4();
    await db.query(logQuery, [
      visit_id,
      visitor_id,
      visit_date,
      JSON.stringify(accompanying_persons || []),
      department_id,
      visiting_user_id,
      purpose,
      visit_type,
      manager_approval
    ]);

    res.status(201).json({ message: 'Visit logged successfully', visit_id });
  } catch (err) {
    console.error('Error logging visit:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

// Get all visitors
async function getAllVisitors(req, res) {
    try {
        const result = await db.query('SELECT * FROM "VMS".vms_visitors ORDER BY created_at DESC');
        res.json({ visitors: result.rows });
    } catch (error) {
        console.error('Error fetching visitors:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

// Get all visit logs
async function getAllVisitLogs(req, res) {
    try {
        const result = await db.query(`
            SELECT v.*, 
                    u.first_name AS host_first_name, 
                    u.last_name AS host_last_name,
                    d.department_name
            FROM "VMS".vms_visit_logs v
            LEFT JOIN "VMS".vms_users u ON v.visiting_user_id = u.user_id
            LEFT JOIN "VMS".vms_departments d ON v.department_id = d.department_id
            ORDER BY v.visit_date DESC
            `);
        res.json({ visits: result.rows });
    } catch (error) {
        console.error('Error fetching visits:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

module.exports = {
    logVisit,
    getAllVisitors,
    getAllVisitLogs
};
