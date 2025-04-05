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

        res.status(201).json({
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
  
module.exports = {
    register,
    login,
    getUserDetails
};