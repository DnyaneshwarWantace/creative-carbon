import { hasFeatures, type OrderContext } from './server'
import { MONEY_FEATURE } from './moneyFields'

export { MONEY_FEATURE, isMoneyEvent, isMoneyStageField, withoutMoneyFields } from './moneyFields'

export async function canSeeMoney(ctx: OrderContext): Promise<boolean> {
  return hasFeatures(ctx, [MONEY_FEATURE])
}
