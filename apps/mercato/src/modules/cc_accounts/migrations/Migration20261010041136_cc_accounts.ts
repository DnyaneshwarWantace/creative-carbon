import { Migration } from '@mikro-orm/migrations';

export class Migration20261010041136_cc_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_company_profiles" add "go_live" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_company_profiles" drop column "go_live";`);
  }

}
