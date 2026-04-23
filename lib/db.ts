import { createClient } from '@/lib/supabase/client'
import type { 
  Strategy, 
  StockPool, 
  StockPoolItem, 
  Position, 
  Trade, 
  TradeReview,
  Alert,
  UserProfile
} from '@/lib/types'

const supabase = createClient()

// User Profile Operations
export async function getUserProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Error fetching user profile:', error)
    return null
  }

  return {
    id: data.id,
    displayName: data.display_name,
    totalCapital: Number(data.total_capital),
    maxSinglePositionRatio: Number(data.max_single_position_ratio),
    maxTotalPositionRatio: Number(data.max_total_position_ratio),
    maxSingleLossRatio: Number(data.max_single_loss_ratio),
    maxDailyLossRatio: Number(data.max_daily_loss_ratio),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function updateUserProfile(profile: Partial<UserProfile>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { error } = await supabase
    .from('user_profiles')
    .update({
      display_name: profile.displayName,
      total_capital: profile.totalCapital,
      max_single_position_ratio: profile.maxSinglePositionRatio,
      max_total_position_ratio: profile.maxTotalPositionRatio,
      max_single_loss_ratio: profile.maxSingleLossRatio,
      max_daily_loss_ratio: profile.maxDailyLossRatio,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    console.error('Error updating user profile:', error)
    return false
  }

  return true
}

// Strategy Operations
export async function getStrategies(): Promise<Strategy[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('strategies')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching strategies:', error)
    return []
  }

  return data.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    strategyType: s.strategy_type,
    isActive: s.is_active,
    params: s.params,
    entryRules: s.entry_rules,
    exitRules: s.exit_rules,
    positionSizing: s.position_sizing,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }))
}

export async function createStrategy(strategy: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>): Promise<Strategy | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('strategies')
    .insert({
      user_id: user.id,
      name: strategy.name,
      description: strategy.description,
      strategy_type: strategy.strategyType,
      is_active: strategy.isActive,
      params: strategy.params,
      entry_rules: strategy.entryRules,
      exit_rules: strategy.exitRules,
      position_sizing: strategy.positionSizing,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating strategy:', error)
    return null
  }

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    strategyType: data.strategy_type,
    isActive: data.is_active,
    params: data.params,
    entryRules: data.entry_rules,
    exitRules: data.exit_rules,
    positionSizing: data.position_sizing,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function updateStrategy(id: string, updates: Partial<Strategy>): Promise<boolean> {
  const { error } = await supabase
    .from('strategies')
    .update({
      name: updates.name,
      description: updates.description,
      strategy_type: updates.strategyType,
      is_active: updates.isActive,
      params: updates.params,
      entry_rules: updates.entryRules,
      exit_rules: updates.exitRules,
      position_sizing: updates.positionSizing,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    console.error('Error updating strategy:', error)
    return false
  }

  return true
}

export async function deleteStrategy(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('strategies')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting strategy:', error)
    return false
  }

  return true
}

// Stock Pool Operations
export async function getStockPools(): Promise<StockPool[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('stock_pools')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching stock pools:', error)
    return []
  }

  return data.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    filterCriteria: p.filter_criteria,
    isActive: p.is_active,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }))
}

export async function createStockPool(pool: Omit<StockPool, 'id' | 'createdAt' | 'updatedAt'>): Promise<StockPool | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('stock_pools')
    .insert({
      user_id: user.id,
      name: pool.name,
      description: pool.description,
      filter_criteria: pool.filterCriteria,
      is_active: pool.isActive,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating stock pool:', error)
    return null
  }

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    filterCriteria: data.filter_criteria,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function getStockPoolItems(poolId: string): Promise<StockPoolItem[]> {
  const { data, error } = await supabase
    .from('stock_pool_items')
    .select('*')
    .eq('pool_id', poolId)
    .order('added_at', { ascending: false })

  if (error) {
    console.error('Error fetching stock pool items:', error)
    return []
  }

  return data.map(item => ({
    id: item.id,
    poolId: item.pool_id,
    stockCode: item.stock_code,
    stockName: item.stock_name,
    sector: item.sector,
    marketCap: Number(item.market_cap),
    peRatio: Number(item.pe_ratio),
    currentPrice: Number(item.current_price),
    signalStatus: item.signal_status,
    notes: item.notes,
    addedAt: item.added_at,
    updatedAt: item.updated_at,
  }))
}

export async function addStockToPool(item: Omit<StockPoolItem, 'id' | 'addedAt' | 'updatedAt'>): Promise<StockPoolItem | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('stock_pool_items')
    .insert({
      user_id: user.id,
      pool_id: item.poolId,
      stock_code: item.stockCode,
      stock_name: item.stockName,
      sector: item.sector,
      market_cap: item.marketCap,
      pe_ratio: item.peRatio,
      current_price: item.currentPrice,
      signal_status: item.signalStatus,
      notes: item.notes,
    })
    .select()
    .single()

  if (error) {
    console.error('Error adding stock to pool:', error)
    return null
  }

  return {
    id: data.id,
    poolId: data.pool_id,
    stockCode: data.stock_code,
    stockName: data.stock_name,
    sector: data.sector,
    marketCap: Number(data.market_cap),
    peRatio: Number(data.pe_ratio),
    currentPrice: Number(data.current_price),
    signalStatus: data.signal_status,
    notes: data.notes,
    addedAt: data.added_at,
    updatedAt: data.updated_at,
  }
}

// Position Operations
export async function getPositions(status?: 'open' | 'closed'): Promise<Position[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  let query = supabase
    .from('positions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching positions:', error)
    return []
  }

  return data.map(p => ({
    id: p.id,
    strategyId: p.strategy_id,
    stockCode: p.stock_code,
    stockName: p.stock_name,
    entryPrice: Number(p.entry_price),
    currentPrice: Number(p.current_price),
    quantity: p.quantity,
    stopLossPrice: p.stop_loss_price ? Number(p.stop_loss_price) : undefined,
    takeProfitPrice: p.take_profit_price ? Number(p.take_profit_price) : undefined,
    trailingStopPercent: p.trailing_stop_percent ? Number(p.trailing_stop_percent) : undefined,
    status: p.status,
    entryDate: p.entry_date,
    exitDate: p.exit_date,
    exitPrice: p.exit_price ? Number(p.exit_price) : undefined,
    pnl: p.pnl ? Number(p.pnl) : undefined,
    pnlPercent: p.pnl_percent ? Number(p.pnl_percent) : undefined,
    notes: p.notes,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }))
}

export async function createPosition(position: Omit<Position, 'id' | 'createdAt' | 'updatedAt'>): Promise<Position | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('positions')
    .insert({
      user_id: user.id,
      strategy_id: position.strategyId,
      stock_code: position.stockCode,
      stock_name: position.stockName,
      entry_price: position.entryPrice,
      current_price: position.currentPrice,
      quantity: position.quantity,
      stop_loss_price: position.stopLossPrice,
      take_profit_price: position.takeProfitPrice,
      trailing_stop_percent: position.trailingStopPercent,
      status: position.status,
      entry_date: position.entryDate,
      notes: position.notes,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating position:', error)
    return null
  }

  return {
    id: data.id,
    strategyId: data.strategy_id,
    stockCode: data.stock_code,
    stockName: data.stock_name,
    entryPrice: Number(data.entry_price),
    currentPrice: Number(data.current_price),
    quantity: data.quantity,
    stopLossPrice: data.stop_loss_price ? Number(data.stop_loss_price) : undefined,
    takeProfitPrice: data.take_profit_price ? Number(data.take_profit_price) : undefined,
    trailingStopPercent: data.trailing_stop_percent ? Number(data.trailing_stop_percent) : undefined,
    status: data.status,
    entryDate: data.entry_date,
    exitDate: data.exit_date,
    exitPrice: data.exit_price ? Number(data.exit_price) : undefined,
    pnl: data.pnl ? Number(data.pnl) : undefined,
    pnlPercent: data.pnl_percent ? Number(data.pnl_percent) : undefined,
    notes: data.notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function updatePosition(id: string, updates: Partial<Position>): Promise<boolean> {
  const { error } = await supabase
    .from('positions')
    .update({
      current_price: updates.currentPrice,
      stop_loss_price: updates.stopLossPrice,
      take_profit_price: updates.takeProfitPrice,
      trailing_stop_percent: updates.trailingStopPercent,
      status: updates.status,
      exit_date: updates.exitDate,
      exit_price: updates.exitPrice,
      pnl: updates.pnl,
      pnl_percent: updates.pnlPercent,
      notes: updates.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    console.error('Error updating position:', error)
    return false
  }

  return true
}

export async function deletePosition(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('positions')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting position:', error)
    return false
  }

  return true
}

// Trade Operations
export async function getTrades(): Promise<Trade[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', user.id)
    .order('trade_date', { ascending: false })

  if (error) {
    console.error('Error fetching trades:', error)
    return []
  }

  return data.map(t => ({
    id: t.id,
    positionId: t.position_id,
    strategyId: t.strategy_id,
    stockCode: t.stock_code,
    stockName: t.stock_name,
    tradeType: t.trade_type,
    price: Number(t.price),
    quantity: t.quantity,
    totalAmount: Number(t.total_amount),
    commission: Number(t.commission),
    tradeDate: t.trade_date,
    reason: t.reason,
    emotionState: t.emotion_state,
    followedRules: t.followed_rules,
    ruleViolations: t.rule_violations,
    createdAt: t.created_at,
  }))
}

export async function createTrade(trade: Omit<Trade, 'id' | 'createdAt'>): Promise<Trade | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id: user.id,
      position_id: trade.positionId,
      strategy_id: trade.strategyId,
      stock_code: trade.stockCode,
      stock_name: trade.stockName,
      trade_type: trade.tradeType,
      price: trade.price,
      quantity: trade.quantity,
      total_amount: trade.totalAmount,
      commission: trade.commission,
      trade_date: trade.tradeDate,
      reason: trade.reason,
      emotion_state: trade.emotionState,
      followed_rules: trade.followedRules,
      rule_violations: trade.ruleViolations,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating trade:', error)
    return null
  }

  return {
    id: data.id,
    positionId: data.position_id,
    strategyId: data.strategy_id,
    stockCode: data.stock_code,
    stockName: data.stock_name,
    tradeType: data.trade_type,
    price: Number(data.price),
    quantity: data.quantity,
    totalAmount: Number(data.total_amount),
    commission: Number(data.commission),
    tradeDate: data.trade_date,
    reason: data.reason,
    emotionState: data.emotion_state,
    followedRules: data.followed_rules,
    ruleViolations: data.rule_violations,
    createdAt: data.created_at,
  }
}

// Alert Operations
export async function getAlerts(unreadOnly = false, strategyId?: string): Promise<Alert[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  let query = supabase
    .from('alerts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (unreadOnly) {
    query = query.eq('is_read', false)
  }

  // P0: 支持按策略过滤
  if (strategyId) {
    query = query.eq('strategy_id', strategyId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching alerts:', error)
    return []
  }

  return data.map(a => ({
    id: a.id,
    strategyId: a.strategy_id,  // P0: 关联策略
    positionId: a.position_id,
    stockCode: a.stock_code,
    stockName: a.stock_name,
    alertType: a.alert_type,
    triggerPrice: a.trigger_price ? Number(a.trigger_price) : undefined,
    currentPrice: a.current_price ? Number(a.current_price) : undefined,
    message: a.message,
    isRead: a.is_read,
    isTriggered: a.is_triggered,
    triggeredAt: a.triggered_at,
    createdAt: a.created_at,
  }))
}

export async function createAlert(alert: Omit<Alert, 'id' | 'createdAt'>): Promise<Alert | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('alerts')
    .insert({
      user_id: user.id,
      strategy_id: alert.strategyId,  // P0: 关联策略
      position_id: alert.positionId,
      stock_code: alert.stockCode,
      stock_name: alert.stockName,
      alert_type: alert.alertType,
      trigger_price: alert.triggerPrice,
      current_price: alert.currentPrice,
      message: alert.message,
      is_read: alert.isRead,
      is_triggered: alert.isTriggered,
      triggered_at: alert.triggeredAt,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating alert:', error)
    return null
  }

  return {
    id: data.id,
    strategyId: data.strategy_id,  // P0: 关联策略
    positionId: data.position_id,
    stockCode: data.stock_code,
    stockName: data.stock_name,
    alertType: data.alert_type,
    triggerPrice: data.trigger_price ? Number(data.trigger_price) : undefined,
    currentPrice: data.current_price ? Number(data.current_price) : undefined,
    message: data.message,
    isRead: data.is_read,
    isTriggered: data.is_triggered,
    triggeredAt: data.triggered_at,
    createdAt: data.created_at,
  }
}

export async function markAlertAsRead(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('alerts')
    .update({ is_read: true })
    .eq('id', id)

  if (error) {
    console.error('Error marking alert as read:', error)
    return false
  }

  return true
}
