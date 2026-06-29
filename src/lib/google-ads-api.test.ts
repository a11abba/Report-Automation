import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGoogleAdsAccessibleCustomers,
  verifyGoogleAdsCustomerAccess,
} from "./google-ads-api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Google Ads account discovery", () => {
  it("returns advertiser children with the manager as login customer", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ resourceNames: ["customers/3086103716"] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              customer: {
                id: "3086103716",
                descriptiveName: "Tribute",
                currencyCode: "CAD",
                manager: true,
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              customerClient: {
                id: "3086103716",
                clientCustomer: "customers/3086103716",
                level: "0",
                manager: true,
                descriptiveName: "Tribute",
                currencyCode: "CAD",
              },
            },
            {
              customerClient: {
                id: "6587451837",
                clientCustomer: "customers/6587451837",
                level: "1",
                manager: false,
                descriptiveName: "DSL - Desiree Solomon Law",
                currencyCode: "CAD",
              },
            },
          ],
        }),
      );

    const customers = await fetchGoogleAdsAccessibleCustomers(
      "access-token",
      "developer-token",
    );

    expect(customers).toEqual([
      {
        customerId: "6587451837",
        displayName: "DSL - Desiree Solomon Law",
        currencyCode: "CAD",
        manager: false,
        loginCustomerId: "3086103716",
        managerDisplayName: "Tribute",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      "login-customer-id": "3086103716",
    });
  });

  it("keeps a directly accessible advertiser without a login customer", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ resourceNames: ["customers/6587451837"] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              customer: {
                id: "6587451837",
                descriptiveName: "DSL - Desiree Solomon Law",
                currencyCode: "CAD",
                manager: false,
              },
            },
          ],
        }),
      );

    await expect(
      fetchGoogleAdsAccessibleCustomers("access-token", "developer-token"),
    ).resolves.toEqual([
      {
        customerId: "6587451837",
        displayName: "DSL - Desiree Solomon Law",
        currencyCode: "CAD",
        manager: false,
        loginCustomerId: null,
        managerDisplayName: null,
      },
    ]);
  });

  it("rejects a manager account as the report customer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        results: [
          {
            customer: {
              id: "3086103716",
              descriptiveName: "Tribute",
              manager: true,
            },
          },
        ],
      }),
    );

    await expect(
      verifyGoogleAdsCustomerAccess(
        "access-token",
        "developer-token",
        "308-610-3716",
      ),
    ).rejects.toThrow("manager account");
  });
});
