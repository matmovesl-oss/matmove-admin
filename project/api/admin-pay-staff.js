import {createMoneyHandler} from '../server/admin-money.js';
export const createHandler=options=>createMoneyHandler('payroll',options);
export default createHandler();
