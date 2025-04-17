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
      visitor_type,
      location,
      company
    } = req.body;

    const visitor_id = await findOrCreateVisitor(first_name, last_name, email, contact_number, company);

    const manager_approval = visit_type === 'planned' ? true : null;
    const manager_exit_approval = null; // default when entry is created

    const logQuery = `
      INSERT INTO "VMS".vms_visit_logs (
        visit_id, visitor_id, visit_date, location, accompanying_persons,
        department_id, visiting_user_id, purpose,
        visit_type, visitor_type, manager_approval, manager_exit_approval
      )
      VALUES (
        $1, $2, $3, $4, $5::jsonb,
        $6, $7, $8,
        $9, $10, $11, $12
      )
      RETURNING visit_id
    `;

    const visit_id = uuidv4();

    await db.query(logQuery, [
      visit_id,
      visitor_id,
      visit_date,
      location || null,
      JSON.stringify(accompanying_persons || {}),
      department_id,
      visiting_user_id,
      purpose,
      visit_type,
      visitor_type || null,
      manager_approval,
      manager_exit_approval
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
          -- Person to meet (combined name)
      CONCAT(users.first_name, ' ', users.last_name) AS meet_with,

        -- Status derived from manager and security approvals
        CASE
          WHEN vlogs.manager_approval = TRUE AND vlogs.security_approval = TRUE THEN 'Approved'
          WHEN vlogs.manager_approval = FALSE OR vlogs.security_approval = FALSE THEN 'Rejected'
          ELSE 'Pending'
        END AS status

      FROM "VMS".vms_visit_logs vlogs
      INNER JOIN "VMS".vms_visitors visitors ON vlogs.visitor_id = visitors.visitor_id
      LEFT JOIN "VMS".vms_users users ON vlogs.visiting_user_id = users.user_id
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
          -- Person to meet (combined name)
      CONCAT(users.first_name, ' ', users.last_name) AS meet_with,

        -- Status derived from manager and security approvals
        CASE
          WHEN vlogs.manager_approval = TRUE AND vlogs.security_approval = TRUE THEN 'Approved'
          WHEN vlogs.manager_approval = FALSE OR vlogs.security_approval = FALSE THEN 'Rejected'
          ELSE 'Pending'
        END AS status

      FROM "VMS".vms_visit_logs vlogs
      INNER JOIN "VMS".vms_visitors visitors ON vlogs.visitor_id = visitors.visitor_id
       LEFT JOIN "VMS".vms_users users ON vlogs.visiting_user_id = users.user_id
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

    const totalLogsQuery = `
      SELECT COUNT(*) AS total_logs
      FROM "VMS".vms_visit_logs
      WHERE visiting_user_id = $1
    `;

    const pendingApprovalsQuery = `
      SELECT COUNT(*) AS pending_approvals
      FROM "VMS".vms_visit_logs
      WHERE visiting_user_id = $1
      AND (manager_approval IS NULL OR manager_approval = FALSE)
    `;

    const currentlyCheckedInQuery = `
      SELECT COUNT(*) AS currently_checked_in
      FROM "VMS".vms_visit_logs
      WHERE visiting_user_id = $1
      AND manager_approval = TRUE
      AND security_approval = TRUE
      AND check_in_time IS NOT NULL
      AND check_out_time IS NULL
    `;

    const approvalCountsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE manager_approval = TRUE) AS approved_count,
        COUNT(*) FILTER (WHERE manager_approval = FALSE) AS rejected_count,
        COUNT(*) FILTER (WHERE manager_approval IS NULL) AS pending_count
      FROM "VMS".vms_visit_logs
      WHERE visiting_user_id = $1
    `;

    const typeCountsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE visit_type = 'planned') AS planned_count,
        COUNT(*) FILTER (WHERE visit_type = 'unplanned') AS unplanned_count
      FROM "VMS".vms_visit_logs
      WHERE visiting_user_id = $1
    `;

    const checkedInUserDetailsQuery = `
      SELECT 
        vvl.visit_id,
        vv.first_name AS visitor_first_name,
        vv.last_name AS visitor_last_name,
        vv.contact_number AS visitor_contact,
        vv.email AS visitor_email,
        vu.first_name AS visiting_user_first_name,
        vu.last_name AS visiting_user_last_name,
        vvl.check_in_time AS "visitDate"
      FROM "VMS".vms_visit_logs vvl
      JOIN "VMS".vms_visitors vv ON vvl.visitor_id = vv.visitor_id
      JOIN "VMS".vms_users vu ON vvl.visiting_user_id = vu.user_id
      WHERE vvl.visiting_user_id = $1
        AND vvl.check_in_time IS NOT NULL
        AND vvl.check_out_time IS NULL
        AND (vvl.manager_exit_approval IS NULL OR vvl.manager_exit_approval = FALSE)
    `;

    const [
      totalLogsResult,
      pendingApprovalsResult,
      currentlyCheckedInResult,
      approvalCountsResult,
      typeCountsResult,
      checkedInUserDetailsResult
    ] = await Promise.all([
      db.query(totalLogsQuery, [managerId]),
      db.query(pendingApprovalsQuery, [managerId]),
      db.query(currentlyCheckedInQuery, [managerId]),
      db.query(approvalCountsQuery, [managerId]),
      db.query(typeCountsQuery, [managerId]),
      db.query(checkedInUserDetailsQuery, [managerId])
    ]);

    res.status(200).json({
      message: 'Manager dashboard analytics fetched successfully',
      data: {
        totalLogs: totalLogsResult.rows[0].total_logs,
        pendingApprovals: pendingApprovalsResult.rows[0].pending_approvals,
        currentlyCheckedIn: currentlyCheckedInResult.rows[0].currently_checked_in,
        approvalCounts: approvalCountsResult.rows[0],
        visitTypeCounts: typeCountsResult.rows[0],
        checkedInVisitors: checkedInUserDetailsResult.rows
      }
    });

  } catch (error) {
    console.error('Error fetching manager visit analytics:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}


async function approveVisitByManager(req, res) {
  try {
    const { visit_id } = req.params;
    const { approval } = req.body;
    

    if (typeof approval !== "boolean") {
      return res.status(400).json({ message: "Approval must be true or false" });
    }

    const checkQuery = `
      SELECT security_approval 
      FROM "VMS".vms_visit_logs 
      WHERE visit_id = $1
    `;
    const checkResult = await db.query(checkQuery, [visit_id]);

    if (checkResult.rowCount === 0) {
      return res.status(404).json({ message: "Visit log not found" });
    }

    const { security_approval } = checkResult.rows[0];

    if (approval === true && security_approval === true) {
      return res.status(403).json({
        message: "Cannot update. Visit already approved by security.",
      });
    }

    const updateQuery = `
      UPDATE "VMS".vms_visit_logs
      SET 
          manager_approval = $1
      WHERE visit_id = $2
      RETURNING visit_id, manager_approval
    `;

    await db.query(updateQuery, [approval, visit_id]);

    res.status(200).json({
      message: approval
        ? "Visitor approved by manager."
        : "Visitor rejected by manager.",
    });
  } catch (err) {
    console.error("Manager approval error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}


async function approveExitByManager(req, res) {
  try {
    const { visit_id } = req.params;
    const { approval } = req.body;

    if (typeof approval !== "boolean") {
      return res.status(400).json({ message: "Approval must be true or false" });
    }

    const checkQuery = `
      SELECT manager_exit_approval 
      FROM "VMS".vms_visit_logs 
      WHERE visit_id = $1
    `;
    const checkResult = await db.query(checkQuery, [visit_id]);

    if (checkResult.rowCount === 0) {
      return res.status(404).json({ message: "Visit log not found" });
    }

    const { manager_exit_approval } = checkResult.rows[0];

    if (manager_exit_approval === true) {
      return res.status(403).json({
        message: "Exit already approved by manager.",
      });
    }

    const updateQuery = `
      UPDATE "VMS".vms_visit_logs
      SET manager_exit_approval = $1
      WHERE visit_id = $2
      RETURNING visit_id, manager_exit_approval
    `;

    await db.query(updateQuery, [approval, visit_id]);

    res.status(200).json({
      message: approval
        ? "Exit approved by manager."
        : "Exit rejected by manager.",
    });
  } catch (err) {
    console.error("Manager exit approval error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}


module.exports = {
    logVisit,
    getAllVisitors,
    getProcessedVisitLogs,
    getProcessedVisitRequests,
    getManagerVisitAnalytics,
    approveVisitByManager,
    approveExitByManager
};