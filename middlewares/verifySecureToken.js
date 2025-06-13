// middlewares/verifySecureToken.js
const jwt = require("jsonwebtoken");

function verifySecureToken(req, res, next) {// Middleware to verify the SecureToken (JWT) in the request headers
	// Check if the request has an Authorization header with a Bearer token
	const token = req.headers.authorization?.split(" ")[1]; // format: "Bearer <token>"

	if (!token) {
		return res.status(401).json({ result: false, message: "SecureToken manquant" });// Missing SecureToken
	}

	try { 
		const decoded = jwt.verify(token, process.env.JWT_SECRET);// Verify the token using the secret key
		req.userId = decoded.userId;// Store the userId in the request object for further use
		// Optionally, you can also store the decoded token in the request object
		next();// Call the next middleware or route handler
		// If the token is valid, proceed to the next middleware or route handler
	} catch (err) {
		return res.status(403).json({ result: false, message: "SecureToken invalide" });
	}
}

module.exports = verifySecureToken;
