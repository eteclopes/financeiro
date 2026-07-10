jest.mock('../../src/config/prisma', () => require('../helpers/prismaMock').createPrismaMock());

const prismaMock = require('../../src/config/prisma');
const { installDefaults } = require('../helpers/prismaMock');
const AppError = require('../../src/utils/AppError');
const { deleteSimulation } = require('../../src/modules/simulators/whatIfSimulator.service');

beforeEach(() => installDefaults(prismaMock));

describe('deleteSimulation — fix 500 -> 404', () => {
  test('simulação existente e do usuário é apagada normalmente', async () => {
    prismaMock.simulation.findFirst.mockResolvedValue({ id: 1n, userId: 10n });
    prismaMock.simulation.delete.mockResolvedValue({ id: 1n });

    await expect(deleteSimulation(10n, 1n)).resolves.toBeUndefined();
    expect(prismaMock.simulation.delete).toHaveBeenCalledWith({ where: { id: 1n } });
  });

  test('REGRESSÃO: simulação inexistente/de outro usuário lança AppError 404 (não mais Error genérico -> 500)', async () => {
    prismaMock.simulation.findFirst.mockResolvedValue(null);

    const promise = deleteSimulation(10n, 999n);

    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({ statusCode: 404, code: 'SIMULATION_NOT_FOUND' });
    expect(prismaMock.simulation.delete).not.toHaveBeenCalled();
  });
});
