function validateId(req, res, next) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            success: false,
            message: "ID must be a positive integer"
        });
    }

    next();
}

module.exports = validateId;