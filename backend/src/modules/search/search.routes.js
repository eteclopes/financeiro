const { Router } = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const service = require('./search.service');

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const results = await service.search(req.userId, req.query.q);
    res.json(results);
  })
);

module.exports = router;
