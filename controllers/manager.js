const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

async function findOrCreateVisitor(first_name, last_name, email, contact_number, company) {
    const query = `
        SELECT * FROM "VMS".vms_visitors
        WHERE email = $1 OR contact_number = $2
        LIMIT 1
    `;
    const result = await db.query(query, [email, contact_number]);

    if (result.rows.length > 0) {
        const existingVisitor = result.rows[0];
        const updates = [];
        const values = [];
        let index = 1;

        if ((!existingVisitor.first_name || existingVisitor.first_name.trim() === '') && first_name) {
            updates.push(`first_name = $${index++}`);
            values.push(first_name);
        }

        if ((!existingVisitor.last_name || existingVisitor.last_name.trim() === '') && last_name) {
            updates.push(`last_name = $${index++}`);
            values.push(last_name);
        }

        if ((!existingVisitor.email || existingVisitor.email.trim() === '') && email) {
            updates.push(`email = $${index++}`);
            values.push(email);
        }

        if ((!existingVisitor.contact_number || existingVisitor.contact_number.trim() === '') && contact_number) {
            updates.push(`contact_number = $${index++}`);
            values.push(contact_number);
        }

        if ((!existingVisitor.company || existingVisitor.company.trim() === '') && company) {
            updates.push(`company = $${index++}`);
            values.push(company);
        }

        if (updates.length > 0) {
            const updateQuery = `
                UPDATE "VMS".vms_visitors
                SET ${updates.join(', ')}
                WHERE visitor_id = $${index}
            `;
            values.push(existingVisitor.visitor_id);
            await db.query(updateQuery, values);
        }

        return existingVisitor.visitor_id;
    }

    // Create new visitor
    const insertQuery = `
        INSERT INTO "VMS".vms_visitors (visitor_id, first_name, last_name, email, contact_number, company)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING visitor_id
    `;
    const newVisitorId = uuidv4();
    const insertResult = await db.query(insertQuery, [
        newVisitorId,
        first_name,
        last_name,
        email,
        contact_number,
        company
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
      visit_type,
      company
    } = req.body;

    const visitor_id = await findOrCreateVisitor(first_name, last_name, email, contact_number, company);

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


async function getProcessedVisitRequests(req, res) {
  try {
    const { department_id, user_id } = req.user;

    const query = `
      SELECT 
        vlogs.visit_id AS visit_log_id,
        visitors.first_name,
        visitors.last_name,
        visitors.email AS company_email,
        visitors.company AS company,
        visitors.contact_number as contact,
        vlogs.department_id,
        vlogs.visit_date,
        vlogs.visit_type,
        vlogs.purpose,
        vlogs.accompanying_persons,

        -- Status derived from manager and security approvals
        CASE
          WHEN vlogs.manager_approval = TRUE AND vlogs.security_approval = TRUE THEN 'Approved'
          WHEN vlogs.manager_approval = FALSE OR vlogs.security_approval = FALSE THEN 'Rejected'
          ELSE 'Pending'
        END AS status

      FROM "VMS".vms_visit_logs vlogs
      INNER JOIN "VMS".vms_visitors visitors ON vlogs.visitor_id = visitors.visitor_id
      WHERE vlogs.department_id = $1
        AND vlogs.visiting_user_id = $2
        AND vlogs.visit_type = 'unplanned'
        AND vlogs.manager_approval IS NULL
      ORDER BY vlogs.visit_date DESC;
    `;

    const result = await db.query(query, [department_id, user_id]);

    res.status(200).json({
      message: 'Filtered unplanned visit logs fetched successfully',
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching visit logs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}


async function getProcessedVisitLogs(req, res) {
  try {
    const { department_id, user_id } = req.user;

    const query = `
      SELECT 
        vlogs.visit_id AS visit_log_id,
        visitors.first_name,
        visitors.last_name,
        visitors.email AS company_email,
        visitors.company AS company,
        visitors.contact_number as contact,
        vlogs.department_id,
        vlogs.visit_date,
        vlogs.visit_type,
        vlogs.purpose,
        vlogs.accompanying_persons,

        -- Status derived from manager and security approvals
        CASE
          WHEN vlogs.manager_approval = TRUE AND vlogs.security_approval = TRUE THEN 'Approved'
          WHEN vlogs.manager_approval = FALSE OR vlogs.security_approval = FALSE THEN 'Rejected'
          ELSE 'Pending'
        END AS status

      FROM "VMS".vms_visit_logs vlogs
      INNER JOIN "VMS".vms_visitors visitors ON vlogs.visitor_id = visitors.visitor_id
      WHERE vlogs.department_id = $1
        AND vlogs.visiting_user_id = $2
      ORDER BY vlogs.visit_date DESC;
    `;

    const result = await db.query(query, [department_id, user_id]);

    res.status(200).json({
      message: 'Filtered unplanned visit logs fetched successfully',
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching visit logs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function getManagerVisitAnalytics(req, res) {
  try {
    const managerId = req.user.user_id;
    console.log(managerId);

    const approvalStatusQuery = `
      SELECT 
        CASE 
          WHEN manager_approval = TRUE AND security_approval = TRUE THEN 'Approved'
          WHEN manager_approval = FALSE OR security_approval = FALSE THEN 'Rejected'
          ELSE 'Pending'
        END AS status,
        COUNT(*) AS count
      FROM "VMS".vms_visit_logs
      WHERE visiting_user_id = $1
      GROUP BY status
    `;

    const plannedUnplannedQuery = `
      SELECT 
        visit_type, 
        COUNT(*) AS count
      FROM "VMS".vms_visit_logs
      WHERE visiting_user_id = $1
      GROUP BY visit_type
    `;

    const distinctVisitorsQuery = `
      SELECT COUNT(DISTINCT visitor_id) AS distinct_visitor_count
      FROM "VMS".vms_visit_logs
      WHERE visiting_user_id = $1
    `;

    const totalLogsQuery = `
      SELECT COUNT(*) AS total_logs
      FROM "VMS".vms_visit_logs
      WHERE visiting_user_id = $1
    `;

    const pendingCountQuery = `
      SELECT COUNT(*) AS pending_count
      FROM "VMS".vms_visit_logs
      WHERE visiting_user_id = $1
      AND (manager_approval IS NULL OR security_approval IS NULL)
    `;

    const [
      approvalStatusResult,
      plannedUnplannedResult,
      distinctVisitorsResult,
      totalLogsResult,
      pendingCountResult
    ] = await Promise.all([
      db.query(approvalStatusQuery, [managerId]),
      db.query(plannedUnplannedQuery, [managerId]),
      db.query(distinctVisitorsQuery, [managerId]),
      db.query(totalLogsQuery, [managerId]),
      db.query(pendingCountQuery, [managerId])
    ]);

    res.status(200).json({
      message: 'Manager-specific visit analytics fetched successfully',
      data: {
        approvalStatusCounts: approvalStatusResult.rows,
        plannedUnplannedCounts: plannedUnplannedResult.rows,
        distinctVisitors: distinctVisitorsResult.rows[0].distinct_visitor_count,
        totalLogs: totalLogsResult.rows[0].total_logs,
        totalPending: pendingCountResult.rows[0].pending_count
      }
    });

  } catch (error) {
    console.error('Error fetching manager visit analytics:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}


module.exports = {
    logVisit,
    getAllVisitors,
    getProcessedVisitLogs,
    getProcessedVisitRequests,
    getManagerVisitAnalytics
};
