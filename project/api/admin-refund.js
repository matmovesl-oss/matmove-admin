import {createMoneyHandler} from '../server/admin-money.js';
export const createHandler=options=>createMoneyHandler('refund',options);
export default createHandler();
