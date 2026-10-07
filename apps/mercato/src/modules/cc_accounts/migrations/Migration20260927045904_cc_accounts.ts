import { Migration } from '@mikro-orm/migrations';

export class Migration20260927045904_cc_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_company_profiles" add "number_series" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_company_profiles" drop column "number_series";`);
  }

}
