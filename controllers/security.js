const db = require("../config/db");

async function approveVisitBySecurity(req, res) {
  try {
    const { visit_id } = req.params;
    const { approval, security_data } = req.body;

    if (typeof approval !== "boolean") {
      return res
        .status(400)
        .json({ message: "Approval must be true or false" });
    }

    // Get existing visit data
    const checkQuery =
      'SELECT manager_approval FROM "VMS".vms_visit_logs WHERE visit_id = $1';
    const checkResult = await db.query(checkQuery, [visit_id]);

    if (checkResult.rowCount === 0) {
      return res.status(404).json({ message: "Visit log not found" });
    }

    const { manager_approval } = checkResult.rows[0];

    // Restrict approval if manager hasn't approved
    if (approval === true && manager_approval !== true) {
      return res.status(403).json({
        message: "Cannot approve. Manager has not approved the visit yet.",
      });
    }

    // Proceed with update
    const updateQuery = `
            UPDATE "VMS".vms_visit_logs
            SET 
                security_approval = $1,
                security_data = $2::jsonb,
                check_in_time = CURRENT_TIMESTAMP
            WHERE visit_id = $3
            RETURNING *
            `;

    const updateResult = await db.query(updateQuery, [
      approval,
      JSON.stringify(security_data || {}),
      visit_id,
    ]);

    res.status(200).json({
      message: approval
        ? "Visitor approved and checked in by security."
        : "Visitor rejected by security.",
      data: updateResult.rows[0],
    });
  } catch (err) {
    console.error("Security approval error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function getSecurityVisitAnalytics(req, res) {
  try {
    const today = new Date().toISOString().split("T")[0];

    const todaysVisitorsQuery = `
        SELECT COUNT(*) AS todays_visitors
        FROM "VMS".vms_visit_logs
        WHERE visit_date = $1
      `;

    const pendingSecurityApprovalsQuery = `
        SELECT COUNT(*) AS pending_security_approvals
        FROM "VMS".vms_visit_logs
        WHERE security_approval IS NULL
      `;

    const approvedSecurityApprovalsQuery = `
        SELECT COUNT(*) AS approved_security_approvals
        FROM "VMS".vms_visit_logs
        WHERE security_approval = TRUE
      `;

    const currentlyInPlantQuery = `
        SELECT COUNT(*) AS currently_in_plant
        FROM "VMS".vms_visit_logs
        WHERE check_in_time IS NOT NULL AND check_out_time IS NULL
      `;

      const checkedInVisitorsListQuery = `
      SELECT 
        vvl.visit_id,
        vv.first_name AS visitor_first_name,
        vv.last_name AS visitor_last_name,
        vv.contact_number AS visitor_contact,
        vv.email AS visitor_email,
        vu.first_name AS visiting_user_first_name,
        vu.last_name AS visiting_user_last_name,
        vvl.check_in_time AS "visitDate",
        vvl.purpose,
        vvl.accompanying_persons,
        CASE 
          WHEN vvl.check_in_time IS NOT NULL AND vvl.check_out_time IS NULL THEN 'Checked In'
          WHEN vvl.check_in_time IS NOT NULL AND vvl.check_out_time IS NOT NULL THEN 'Checked Out'
          ELSE 'Pending'
        END AS currentStatus
      FROM "VMS".vms_visit_logs vvl
      JOIN "VMS".vms_visitors vv ON vvl.visitor_id = vv.visitor_id
      JOIN "VMS".vms_users vu ON vvl.visiting_user_id = vu.user_id
      WHERE vvl.check_in_time IS NOT NULL AND vvl.check_out_time IS NULL
    `;
    

    const [
      todaysVisitorsResult,
      pendingSecurityResult,
      approvedSecurityResult,
      inPlantResult,
      checkedInVisitorsListResult,
    ] = await Promise.all([
      db.query(todaysVisitorsQuery, [today]),
      db.query(pendingSecurityApprovalsQuery),
      db.query(approvedSecurityApprovalsQuery),
      db.query(currentlyInPlantQuery),
      db.query(checkedInVisitorsListQuery),
    ]);

    res.status(200).json({
      message: "Security visit analytics fetched successfully",
      data: {
        todaysVisitors: todaysVisitorsResult.rows[0].todays_visitors,
        pendingSecurityApprovals:
          pendingSecurityResult.rows[0].pending_security_approvals,
        approvedSecurityApprovals:
          approvedSecurityResult.rows[0].approved_security_approvals,
        currentlyInPlant: inPlantResult.rows[0].currently_in_plant,
        checkedInVisitorsList: checkedInVisitorsListResult.rows, // this is an array of objects
      },
    });
  } catch (error) {
    console.error("Error fetching security visit analytics:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function getSecurityRequests(req, res) {
  try {
    const query = `
        SELECT 
          vlogs.visit_id AS visit_log_id,
          visitors.first_name,
          visitors.last_name,
          visitors.email AS company_email,
          visitors.company AS company,
          visitors.contact_number AS contact,
          vlogs.department_id,
          vlogs.visit_date,
          vlogs.visit_type,
          vlogs.visitor_type,
          vlogs.purpose,
          vlogs.accompanying_persons,

          -- Person to meet (combined name)
          CONCAT(users.first_name, ' ', users.last_name, ' (', users.designation, ')') AS whom_to_meet,
          vlogs.location,
  
          -- Status derived from approvals
          CASE
            WHEN vlogs.manager_approval = TRUE AND vlogs.security_approval = TRUE THEN 'Approved'
            WHEN vlogs.manager_approval = FALSE OR vlogs.security_approval = FALSE THEN 'Rejected'
            ELSE 'Pending'
          END AS status
  
        FROM "VMS".vms_visit_logs vlogs
        INNER JOIN "VMS".vms_visitors visitors ON vlogs.visitor_id = visitors.visitor_id
          LEFT JOIN "VMS".vms_users users ON vlogs.visiting_user_id = users.user_id
        WHERE vlogs.manager_approval = TRUE
          AND vlogs.security_approval IS NULL
        ORDER BY vlogs.visit_date DESC;
      `;

    const result = await db.query(query);

    res.status(200).json({
      message: "Security pending approval requests fetched successfully",
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching security requests:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function checkoutVisitor(req, res) {
  try {
    const { visit_log_id } = req.params;

    if (!visit_log_id) {
      return res.status(400).json({ message: 'Visit log ID is required' });
    }

    const query = `
        UPDATE "VMS".vms_visit_logs
        SET 
          check_out_time = NOW()
        WHERE visit_id = $1
        RETURNING visit_id, check_out_time;
      `;

    const result = await db.query(query, [visit_log_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Visit log not found or already checked out' });
    }

    res.status(200).json({
      message: 'Visitor checked out successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error during checkout:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function getProcessedVisitLogs(req, res) {
  const { start_date, end_date } = req.query;

  if (!start_date || !end_date) {
    return res.status(400).json({ message: 'Start and end date are required' });
  }

  try {
    const query = `
      SELECT 
        vlogs.visit_id AS visit_log_id,
        visitors.first_name,
        visitors.last_name,
        visitors.email AS company_email,
        visitors.company AS company,
        visitors.contact_number AS contact,
        vlogs.department_id,
        vlogs.purpose,
        vlogs.visit_date,
        vlogs.visit_type,
        vlogs.visitor_type,
        vlogs.accompanying_persons,
        vlogs.location,
        vlogs.check_in_time,
        vlogs.check_out_time,
        vlogs.security_data,
        CONCAT(users.first_name, ' ', users.last_name, ' (', users.designation, ')') AS whom_to_meet,

        CASE
          WHEN vlogs.manager_approval = TRUE AND vlogs.security_approval = TRUE THEN 'Approved'
          WHEN vlogs.manager_approval = FALSE OR vlogs.security_approval = FALSE THEN 'Rejected'
          ELSE 'Pending'
        END AS status,

        CASE
          WHEN vlogs.manager_approval = FALSE OR vlogs.security_approval = FALSE THEN 'Rejected'
          WHEN vlogs.check_in_time IS NULL AND vlogs.check_out_time IS NULL THEN 'Not Visited Yet'
          WHEN vlogs.check_in_time IS NOT NULL AND vlogs.check_out_time IS NULL THEN 'Checked In Only'
          WHEN vlogs.check_in_time IS NOT NULL AND vlogs.check_out_time IS NOT NULL THEN 'Checked Out'
          ELSE 'Unknown'
        END AS visit_status

      FROM "VMS".vms_visit_logs vlogs
      INNER JOIN "VMS".vms_visitors visitors ON vlogs.visitor_id = visitors.visitor_id
      LEFT JOIN "VMS".vms_users users ON vlogs.visiting_user_id = users.user_id
      WHERE vlogs.visit_date BETWEEN $1 AND $2
        AND vlogs.manager_approval = TRUE
        AND vlogs.security_approval = TRUE
        AND vlogs.check_out_time IS NOT NULL
      ORDER BY vlogs.visit_date DESC, vlogs.check_out_time DESC;
    `;

    const result = await db.query(query, [start_date, end_date]);

    res.status(200).json({
      message: 'Checked-out visit logs fetched successfully',
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching visit logs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = {
  approveVisitBySecurity,
  getSecurityVisitAnalytics,
  getSecurityRequests,
  checkoutVisitor,
  getProcessedVisitLogs
};
