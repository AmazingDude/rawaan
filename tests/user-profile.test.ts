import { describe, expect, it } from "vitest";

import { clinicNameFromFirstName, getClinicName, getOrCreateClinicName, updateClinicName } from "@/lib/db/user-profile";
import { createTestDatabase } from "./helpers/supabase";

describe("user clinic profile", () => {
  it("uses the Clerk first name as a safe new-account default", () => {
    expect(clinicNameFromFirstName("Aashir")).toBe("Aashir's Clinic");
    expect(clinicNameFromFirstName("  ")).toBe("Your Clinic");
    expect(clinicNameFromFirstName("A".repeat(100))).toBe(`${"A".repeat(70)}'s Clinic`);
  });

  it("initializes only a blank owner's name and keeps custom names separate", async () => {
    const db = createTestDatabase();
    db.tables.app_users.push({ id: "user-a", clinic_name: "" }, { id: "user-b", clinic_name: "B's Clinic" });

    expect(await getOrCreateClinicName("user-a", "Aashir's Clinic", () => db.client)).toBe("Aashir's Clinic");
    expect(await getOrCreateClinicName("user-b", "Ignored Default Clinic", () => db.client)).toBe("B's Clinic");
    expect(await getClinicName("user-a", () => db.client)).toBe("Aashir's Clinic");
  });

  it("updates only the selected owner and rejects invalid names", async () => {
    const db = createTestDatabase();
    db.tables.app_users.push({ id: "user-a", clinic_name: "Aashir's Clinic" }, { id: "user-b", clinic_name: "Other Clinic" });

    await expect(updateClinicName("user-a", "  North Star Clinic  ", () => db.client)).resolves.toBe("North Star Clinic");
    expect(db.tables.app_users).toEqual([
      { id: "user-a", clinic_name: "North Star Clinic" },
      { id: "user-b", clinic_name: "Other Clinic" },
    ]);
    await expect(updateClinicName("user-a", " ", () => db.client)).rejects.toThrow(/storage/i);
    await expect(updateClinicName("user-a", "x".repeat(81), () => db.client)).rejects.toThrow(/storage/i);
  });
});
