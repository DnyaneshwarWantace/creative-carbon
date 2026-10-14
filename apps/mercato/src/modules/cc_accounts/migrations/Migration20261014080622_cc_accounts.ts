import { Migration } from '@mikro-orm/migrations';

export class Migration20261014080622_cc_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_company_profiles" add "letterhead" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_company_profiles" drop column "letterhead";`);
  }

}
