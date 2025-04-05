const db = require('../config/db');

async function approveVisitBySecurity(req, res) {
    try {
        const { visit_id } = req.params;
        const { approval, security_data } = req.body;

        if (typeof approval !== 'boolean') {
            return res.status(400).json({ message: 'Approval must be true or false' });
        }

        // Get existing visit data
        const checkQuery = 'SELECT manager_approval FROM "VMS".vms_visit_logs WHERE visit_id = $1';
        const checkResult = await db.query(checkQuery, [visit_id]);

        if (checkResult.rowCount === 0) {
            return res.status(404).json({ message: 'Visit log not found' });
        }

        const { manager_approval } = checkResult.rows[0];

        // Restrict approval if manager hasn't approved
        if (approval === true && manager_approval !== true) {
            return res.status(403).json({
                message: 'Cannot approve. Manager has not approved the visit yet.',
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
                ? 'Visitor approved and checked in by security.'
                : 'Visitor rejected by security.',
            data: updateResult.rows[0],
        });

    } catch (err) {
        console.error('Security approval error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}

module.exports = {
    approveVisitBySecurity,
};
