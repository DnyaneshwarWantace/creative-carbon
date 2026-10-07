import { Migration } from '@mikro-orm/migrations';

export class Migration20260926191721_cc_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_company_profiles" add "grn_over_percent" int not null default 0;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_company_profiles" drop column "grn_over_percent";`);
  }

}
