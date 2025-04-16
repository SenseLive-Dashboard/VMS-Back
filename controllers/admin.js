const db = require('../config/db');

async function getUsers(req, res) {
  try {
    const { department_id } = req.query;

    let query = `
      SELECT 
        user_id, first_name, last_name, email, role, phone, department_id, designation,status
      FROM 
        "VMS".vms_users
    `;
    let values = [];

    if (department_id && department_id !== '0') {
      query += ' WHERE department_id = $1';
      values.push(department_id);
    }

    const result = await db.query(query, values);

    res.status(200).json({
      message: 'Users fetched successfully',
      users: result.rows,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function getAllDepartments(req, res) {
  try {
    const result = await db.query('SELECT department_id, department_name FROM "VMS".vms_departments ORDER BY department_name ASC');

    res.status(200).json({
      message: 'Departments fetched successfully',
      departments: result.rows,
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

// async function getVisitAnalytics(req, res) {
//   try {
//     const visitTypeQuery = `
//       SELECT visit_type, COUNT(*) AS count
//       FROM "VMS".vms_visit_logs
//       GROUP BY visit_type
//     `;

//     const departmentCountQuery = `
//       SELECT 
//         d.department_name, 
//         COUNT(v.visit_id) AS visit_count
//       FROM "VMS".vms_visit_logs v
//       LEFT JOIN "VMS".vms_departments d ON v.department_id = d.department_id
//       GROUP BY d.department_name
//     `;

//     const approvalStatusQuery = `
//       SELECT 
//         CASE 
//           WHEN manager_approval = TRUE AND security_approval = TRUE THEN 'Approved'
//           WHEN manager_approval = FALSE OR security_approval = FALSE THEN 'Rejected'
//           ELSE 'Pending'
//         END AS status,
//         COUNT(*) AS count
//       FROM "VMS".vms_visit_logs
//       GROUP BY status
//     `;

//     const TotalVisitorsQuery = `
//       SELECT COUNT(*) AS count
//       FROM "VMS".vms_visitors
//     `;

//     const CheckInQuery = `
//       SELECT COUNT(*) AS currently_checked_in
//       FROM "VMS".vms_visit_logs
//       WHERE check_in_time IS NOT NULL
//       AND check_out_time IS NULL;
//     `;

//     // Run all queries in parallel
//     const [visitTypeResult, departmentResult, approvalStatusResult, TotalVisitorsResult, CheckInResult] = await Promise.all([
//       db.query(visitTypeQuery),
//       db.query(departmentCountQuery),
//       db.query(approvalStatusQuery),
//       db.query(TotalVisitorsQuery),
//       db.query(CheckInQuery)
//     ]);

//     res.status(200).json({
//       message: 'Visit analytics fetched successfully',
//       data: {
//         visitTypeCounts: visitTypeResult.rows,
//         departmentCounts: departmentResult.rows,
//         approvalStatusCounts: approvalStatusResult.rows,
//         totalVisitors: TotalVisitorsResult.rows[0].count,
//         CheckIn: CheckInResult.rows[0].currently_checked_in,
//       }
//     });

//   } catch (error) {
//     console.error('Error fetching visit analytics:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// }
async function getVisitAnalytics(req, res) {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Start and end date are required' });
    }

    const visitTypeQuery = `
      SELECT visit_type, COUNT(*) AS count
      FROM "VMS".vms_visit_logs
      WHERE visit_date BETWEEN $1 AND $2
      GROUP BY visit_type
    `;

    const departmentCountQuery = `
      SELECT 
        d.department_name, 
        COUNT(v.visit_id) AS visit_count
      FROM "VMS".vms_visit_logs v
      LEFT JOIN "VMS".vms_departments d ON v.department_id = d.department_id
      WHERE visit_date BETWEEN $1 AND $2
      GROUP BY d.department_name
    `;

    const approvalStatusQuery = `
      SELECT 
        CASE 
          WHEN manager_approval = TRUE AND security_approval = TRUE THEN 'Approved'
          WHEN manager_approval = FALSE OR security_approval = FALSE THEN 'Rejected'
          ELSE 'Pending'
        END AS status,
        COUNT(*) AS count
      FROM "VMS".vms_visit_logs
      WHERE visit_date BETWEEN $1 AND $2
      GROUP BY status
    `;

    const totalVisitsQuery = `
      SELECT COUNT(*) AS count
      FROM "VMS".vms_visit_logs
      WHERE visit_date BETWEEN $1 AND $2
    `;

    const totalRegisteredVisitorsQuery = `
      SELECT COUNT(*) AS count
      FROM "VMS".vms_visitors
    `;

    const currentlyCheckedInQuery = `
      SELECT COUNT(*) AS currently_checked_in
      FROM "VMS".vms_visit_logs
      WHERE check_in_time IS NOT NULL
      AND check_out_time IS NULL
    `;

    const pendingApprovalsQuery = `
      SELECT COUNT(*) AS pending_count
      FROM "VMS".vms_visit_logs
      WHERE 
        (manager_approval IS DISTINCT FROM TRUE OR security_approval IS DISTINCT FROM TRUE)
        AND visit_date >= CURRENT_DATE - INTERVAL '3 days'
    `;

    const [
      visitTypeResult,
      departmentResult,
      approvalStatusResult,
      totalVisitsResult,
      totalRegisteredVisitorsResult,
      currentlyCheckedInResult,
      pendingApprovalsResult
    ] = await Promise.all([
      db.query(visitTypeQuery, [start_date, end_date]),
      db.query(departmentCountQuery, [start_date, end_date]),
      db.query(approvalStatusQuery, [start_date, end_date]),
      db.query(totalVisitsQuery, [start_date, end_date]),
      db.query(totalRegisteredVisitorsQuery),
      db.query(currentlyCheckedInQuery),
      db.query(pendingApprovalsQuery),
    ]);

    res.status(200).json({
      message: 'Visit analytics fetched successfully',
      data: {
        visitTypeCounts: visitTypeResult.rows,
        departmentCounts: departmentResult.rows,
        approvalStatusCounts: approvalStatusResult.rows,
        totalVisitLogs: totalVisitsResult.rows[0].count,
        totalRegisteredVisitors: totalRegisteredVisitorsResult.rows[0].count,
        currentlyCheckedIn: currentlyCheckedInResult.rows[0].currently_checked_in,
        pendingApprovalsInLast3Days: pendingApprovalsResult.rows[0].pending_count,
      }
    });

  } catch (error) {
    console.error('Error fetching visit analytics:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}


async function getProcessedVisitLogs(req, res) {
  try {
    const query = `
    SELECT 
      vlogs.visit_id AS visit_log_id,
      visitors.first_name,
      visitors.last_name,
      visitors.email AS company_email,
      visitors.company AS company,
      visitors.contact_number as contact,
      vlogs.department_id,
        vlogs.purpose,
      vlogs.visit_date,
      vlogs.visit_type,
  
      -- Person to meet (combined name)
      CONCAT(users.first_name, ' ', users.last_name) AS meet_with,
  
      -- Status derived from manager and security approvals
      CASE
        WHEN vlogs.manager_approval = TRUE AND vlogs.security_approval = TRUE THEN 'Approved'
        WHEN vlogs.manager_approval = FALSE OR vlogs.security_approval = FALSE THEN 'Rejected'
        ELSE 'Pending'
      END AS status,
  
      -- Visit status based on check-in/out timestamps
      CASE
        WHEN vlogs.manager_approval = FALSE OR vlogs.security_approval = FALSE THEN 'Rejected'
        WHEN vlogs.check_in_time IS NULL AND vlogs.check_out_time IS NULL THEN 'Not Visited Yet'
        WHEN vlogs.check_in_time IS NOT NULL AND vlogs.check_out_time IS NULL THEN 'Checked In Only'
        WHEN vlogs.check_in_time IS NOT NULL AND vlogs.check_out_time IS NOT NULL THEN 'Checked Out'
        ELSE 'Unknown'
      END AS visit_status,
  
      vlogs.check_in_time,
      vlogs.check_out_time
  
    FROM "VMS".vms_visit_logs vlogs
    INNER JOIN "VMS".vms_visitors visitors ON vlogs.visitor_id = visitors.visitor_id
    LEFT JOIN "VMS".vms_users users ON vlogs.visiting_user_id = users.user_id
    ORDER BY vlogs.visit_date DESC, vlogs.check_in_time DESC;
  `;
  
    const result = await db.query(query);

    res.status(200).json({
      message: 'Visit logs with approval and visit status fetched successfully',
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching visit logs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}


module.exports = {
  getUsers,
  getAllDepartments,
  getVisitAnalytics,
  getProcessedVisitLogs
};
