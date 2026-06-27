const { Router } = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const monthsRoutes = require('../modules/months/months.routes');
const categoriesRoutes = require('../modules/categories/categories.routes');
const incomesRoutes = require('../modules/incomes/incomes.routes');
const expensesRoutes = require('../modules/expenses/expenses.routes');
const debtsRoutes = require('../modules/debts/debts.routes');
const cardsRoutes = require('../modules/cards/cards.routes');
const savingsRoutes = require('../modules/savings/savings.routes');
const goalsRoutes = require('../modules/goals/goals.routes');
const dashboardRoutes = require('../modules/dashboard/dashboard.routes');
const financialHealthRoutes = require('../modules/financialHealth/financialHealth.routes');
const alertsRoutes = require('../modules/alerts/alerts.routes');
const projectionsRoutes = require('../modules/projections/projections.routes');
const simulatorsRoutes = require('../modules/simulators/simulators.routes');
const recommendationsRoutes = require('../modules/recommendations/recommendations.routes');
const behavioralAnalysisRoutes = require('../modules/behavioralAnalysis/behavioralAnalysis.routes');
const historyRoutes = require('../modules/history/history.routes');

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

router.use('/auth', authRoutes);
router.use('/months', monthsRoutes);
router.use('/categories', categoriesRoutes);
router.use('/incomes', incomesRoutes);
router.use('/expenses', expensesRoutes);
router.use('/debts', debtsRoutes);
router.use('/cards', cardsRoutes);
router.use('/savings', savingsRoutes);
router.use('/goals', goalsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/financial-health', financialHealthRoutes);
router.use('/alerts', alertsRoutes);
router.use('/projections', projectionsRoutes);
router.use('/simulators', simulatorsRoutes);
router.use('/recommendations', recommendationsRoutes);
router.use('/behavioral-analysis', behavioralAnalysisRoutes);
router.use('/history', historyRoutes);

module.exports = router;
