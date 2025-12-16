// Types temporaires jusqu'à la régénération du client Prisma
// Ces types seront remplacés par ceux de @prisma/client après npx prisma generate

export enum CashRegisterStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum CashRegisterTransactionType {
  OPENING = 'OPENING',
  CASH_SALE = 'CASH_SALE',
  CASH_RETURN = 'CASH_RETURN',
  CASH_IN = 'CASH_IN',
  CASH_OUT = 'CASH_OUT',
  CLOSING = 'CLOSING',
  RECONCILIATION = 'RECONCILIATION',
}

// Extension temporaire de UserRole avec MANAGER
export enum UserRoleExtended {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
}
