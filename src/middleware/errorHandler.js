const {validationResult} = require('express-validator')

function validate(req,res,next) {
    const errors = validationResult(req)
    if(!errors.isEmpty()){
        return res.status(422).json({ errors: errors.array() })
    }
    next()
}

function errorHandler(err, req, res, next) {
    console.error(err)
    const status = err.status || 500
    const message = err.message || 'Internal server error'
    res.status(status).json({ error: message })
}

module.exports = {validate, errorHandler}
