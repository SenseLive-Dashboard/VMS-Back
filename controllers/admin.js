const db = require('../config/db');

async function getUsers(req, res) {
  try {
    const { department_id } = req.query;

    let query = `
      SELECT 
        user_id, first_name, last_name, email, role, phone, department_id, designation
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

async function getVisitAnalytics(req, res) {
  try {
    const visitTypeQuery = `
      SELECT visit_type, COUNT(*) AS count
      FROM "VMS".vms_visit_logs
      GROUP BY visit_type
    `;

    const departmentCountQuery = `
      SELECT 
        d.department_name, 
        COUNT(v.visit_id) AS visit_count
      FROM "VMS".vms_visit_logs v
      LEFT JOIN "VMS".vms_departments d ON v.department_id = d.department_id
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
      GROUP BY status
    `;

    // Run all queries in parallel
    const [visitTypeResult, departmentResult, approvalStatusResult] = await Promise.all([
      db.query(visitTypeQuery),
      db.query(departmentCountQuery),
      db.query(approvalStatusQuery)
    ]);

    res.status(200).json({
      message: 'Visit analytics fetched successfully',
      data: {
        visitTypeCounts: visitTypeResult.rows,
        departmentCounts: departmentResult.rows,
        approvalStatusCounts: approvalStatusResult.rows
      }
    });

  } catch (error) {
    console.error('Error fetching visit analytics:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}


module.exports = {
  getUsers,
  getAllDepartments,
  getVisitAnalytics
};
