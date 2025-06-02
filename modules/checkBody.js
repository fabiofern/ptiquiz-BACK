// BACK/modules/checkBody.js

function checkBody(body, requiredFields) {
    return requiredFields.every(field => {
        return body[field] !== undefined && body[field] !== "";
    });
}

module.exports = { checkBody };
