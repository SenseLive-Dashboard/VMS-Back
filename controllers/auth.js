const bcrypt = require('bcrypt');
const db = require('../config/db');
const { generateToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

async function register(req, res) {
    try {
        const {
            first_name,
            last_name,
            email,
            role,
            phone,
            department_id,
            password,
            designation,
        } = req.body;

        const validRoles = ['manager', 'security', 'admin'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ message: 'Invalid role specified.' });
        }

        const userExistsQuery = 'SELECT 1 FROM "VMS".vms_users WHERE email = $1';
        const userExistsResult = await db.query(userExistsQuery, [email]);

        if (userExistsResult.rowCount > 0) {
            return res.status(400).json({ message: 'Email already registered.' });
        }

        const departmentExistsQuery = 'SELECT 1 FROM "VMS".vms_departments WHERE department_id = $1';
        const departmentExistsResult = await db.query(departmentExistsQuery, [department_id]);

        if (departmentExistsResult.rowCount === 0) {
            return res.status(400).json({ message: 'Invalid department ID.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const insertQuery = `
        INSERT INTO "VMS".vms_users 
          (first_name, last_name, email, role, phone, department_id, password_hash, designation)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING user_id
      `;

        const insertResult = await db.query(insertQuery, [
            first_name,
            last_name,
            email,
            role,
            phone,
            department_id,
            hashedPassword,
            designation
        ]);

        res.status(200).json({
            message: 'User registered successfully.',
            user_id: insertResult.rows[0].user_id,
        });

    } catch (error) {
        console.error('Error in registration:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
}

async function login(req, res) {
    try {
        const { email, password } = req.body;

        const query = `
        SELECT user_id, first_name, last_name, email, role, password_hash, department_id, designation
        FROM "VMS".vms_users
        WHERE email = $1
      `;

        const result = await db.query(query, [email]);
        if (result.rowCount === 0) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const payload = {
            user_id: user.user_id,
            email: user.email,
            role: user.role,
            designation: user.designation,
            department_id: user.department_id,
        };

        const token = generateToken(payload);

        res.status(200).json({
            message: 'Login successful',
            token
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}


function getUserDetails(req, res) {
    const user = req.user;
    res.json({ user });
}

// PUT /api/users/:id
async function updateUser(req, res) {
    try {
        const { id } = req.params;
        const {
            first_name,
            last_name,
            role,
            phone,
            department_id,
            password,
            designation,
            email
        } = req.body;

        const validRoles = ['manager', 'security', 'admin'];
        if (role && !validRoles.includes(role)) {
            return res.status(400).json({ message: 'Invalid role specified.' });
        }

        // Check if user exists
        const userExistsQuery = 'SELECT 1 FROM "VMS".vms_users WHERE user_id = $1';
        const userExistsResult = await db.query(userExistsQuery, [id]);

        if (userExistsResult.rowCount === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Check if department is valid (if provided)
        if (department_id) {
            const deptCheck = await db.query(
                'SELECT 1 FROM "VMS".vms_departments WHERE department_id = $1',
                [department_id]
            );
            if (deptCheck.rowCount === 0) {
                return res.status(400).json({ message: 'Invalid department ID.' });
            }
        }

        // Prepare fields and values for dynamic SQL
        const fields = [];
        const values = [];
        let idx = 1;

        if (first_name) { fields.push(`first_name = $${idx++}`); values.push(first_name); }
        if (last_name) { fields.push(`last_name = $${idx++}`); values.push(last_name); }
        if (role) { fields.push(`role = $${idx++}`); values.push(role); }
        if (phone) { fields.push(`phone = $${idx++}`); values.push(phone); }
        if (department_id) { fields.push(`department_id = $${idx++}`); values.push(department_id); }
        if (designation) { fields.push(`designation = $${idx++}`); values.push(designation); }
        if (email) {
            fields.push(`email = $${idx++}`);
            values.push(email);
        } if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            fields.push(`password_hash = $${idx++}`);
            values.push(hashedPassword);
        }

        if (fields.length === 0) {
            return res.status(400).json({ message: 'No fields provided for update.' });
        }

        const updateQuery = `
            UPDATE "VMS".vms_users
            SET ${fields.join(', ')}
            WHERE user_id = $${idx}
        `;
        values.push(id);

        await db.query(updateQuery, values);

        res.status(200).json({ message: 'User updated successfully.' });
    } catch (error) {
        console.error('Error in updateUser:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
}


module.exports = {
    register,
    login,
    getUserDetails,
    updateUser
};