"use client";

import { useState } from "react";
import { createContact } from "./actions";
import { CONTACT_TYPE_META } from "@/lib/contact-types";
import type { ContactType } from "@/lib/contact-types";

const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-sm font-medium text-slate-700 mb-1";
const selectCls = `${inputCls} bg-white`;
const sectionCls = "border-t border-slate-100 pt-4 mt-4 space-y-4";

const TYPES = ["landlord", "buyer", "seller", "renter"] as const;

export default function ContactForm({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactType, setContactType] = useState<ContactType>("renter");
  const [typeData, setTypeData] = useState<Record<string, any>>({});

  const updateField = (key: string, value: any) => {
    setTypeData(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      formData.set("contactType", contactType);
      // Filter out empty values from typeData
      const cleaned: Record<string, any> = {};
      for (const [k, v] of Object.entries(typeData)) {
        if (v !== "" && v !== undefined && v !== null) cleaned[k] = v;
      }
      if (Object.keys(cleaned).length > 0) {
        formData.set("typeData", JSON.stringify(cleaned));
      }
      await createContact(formData);
      setOpen(false);
      setContactType("renter");
      setTypeData({});
      e.currentTarget.reset();
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        + Add Contact
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Add New Contact</h2>
          <button onClick={() => { setOpen(false); setContactType("renter"); setTypeData({}); }} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
          )}

          {/* Contact Type Selector */}
          <div>
            <label className={labelCls}>Contact Type</label>
            <div className="flex gap-2">
              {TYPES.map((t) => {
                const meta = CONTACT_TYPE_META[t];
                const active = contactType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setContactType(t); setTypeData({}); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                      active
                        ? `${meta.bgColor} ${meta.color} border-current ring-1 ring-current`
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span>{meta.icon}</span>
                    <span className="hidden sm:inline">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Common fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>First name *</label>
              <input name="firstName" required className={inputCls} placeholder="Jane" />
            </div>
            <div>
              <label className={labelCls}>Last name *</label>
              <input name="lastName" required className={inputCls} placeholder="Smith" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Email</label>
            <input name="email" type="email" className={inputCls} placeholder="jane@example.com" />
          </div>

          <div>
            <label className={labelCls}>Phone</label>
            <input name="phone" type="tel" className={inputCls} placeholder="(555) 123-4567" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>City</label>
              <input name="city" className={inputCls} placeholder="New York" />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input name="state" className={inputCls} placeholder="NY" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Lead source</label>
            <select name="source" className={selectCls}>
              <option value="">Select source...</option>
              <option value="website">Website</option>
              <option value="referral">Referral</option>
              <option value="zillow">Zillow</option>
              <option value="realtor.com">Realtor.com</option>
              <option value="streeteasy">StreetEasy</option>
              <option value="open_house">Open House</option>
              <option value="cold_call">Cold Call</option>
              <option value="social_media">Social Media</option>
              <option value="market_intel">Market Intel</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea name="notes" rows={3} className={`${inputCls} resize-none`} placeholder="Any initial notes about this contact..." />
          </div>

          {/* Type-specific fields */}
          {contactType === "landlord" && <LandlordFields data={typeData} onChange={updateField} />}
          {contactType === "buyer" && <BuyerFields data={typeData} onChange={updateField} />}
          {contactType === "seller" && <SellerFields data={typeData} onChange={updateField} />}
          {contactType === "renter" && <RenterFields data={typeData} onChange={updateField} />}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setOpen(false); setContactType("renter"); setTypeData({}); }} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50">
              {loading ? "Saving..." : "Add Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Type-specific field sections ──

function LandlordFields({ data, onChange }: { data: Record<string, any>; onChange: (k: string, v: any) => void }) {
  return (
    <div className={sectionCls}>
      <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Landlord Details</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Entity / LLC Name</label>
          <input className={inputCls} value={data.entityName || ""} onChange={e => onChange("entityName", e.target.value)} placeholder="Smith Holdings LLC" />
        </div>
        <div>
          <label className={labelCls}>Entity Type</label>
          <select className={selectCls} value={data.entityType || ""} onChange={e => onChange("entityType", e.target.value)}>
            <option value="">Select...</option>
            <option value="individual">Individual</option>
            <option value="llc">LLC</option>
            <option value="corp">Corporation</option>
            <option value="trust">Trust</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Role</label>
          <select className={selectCls} value={data.role || ""} onChange={e => onChange("role", e.target.value)}>
            <option value="">Select...</option>
            <option value="Owner">Owner</option>
            <option value="Manager">Manager</option>
            <option value="Agent">Agent</option>
            <option value="Super">Super</option>
            <option value="Principal">Principal</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Portfolio Size</label>
          <input type="number" className={inputCls} value={data.portfolioSize || ""} onChange={e => onChange("portfolioSize", e.target.value ? Number(e.target.value) : undefined)} placeholder="# buildings" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Total Units</label>
          <input type="number" className={inputCls} value={data.totalUnits || ""} onChange={e => onChange("totalUnits", e.target.value ? Number(e.target.value) : undefined)} placeholder="# units" />
        </div>
        <div>
          <label className={labelCls}>Preferred Contact</label>
          <select className={selectCls} value={data.preferredContact || ""} onChange={e => onChange("preferredContact", e.target.value)}>
            <option value="">Select...</option>
            <option value="phone">Phone</option>
            <option value="email">Email</option>
            <option value="in-person">In-Person</option>
            <option value="mail">Mail</option>
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Mailing Address</label>
        <input className={inputCls} value={data.mailingAddress || ""} onChange={e => onChange("mailingAddress", e.target.value)} placeholder="123 Main St, New York, NY 10001" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Exclusive Status</label>
          <select className={selectCls} value={data.exclusiveStatus || ""} onChange={e => onChange("exclusiveStatus", e.target.value)}>
            <option value="">None</option>
            <option value="verbal">Verbal</option>
            <option value="written">Written</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Decision Maker?</label>
          <select className={selectCls} value={data.decisionMaker === true ? "yes" : data.decisionMaker === false ? "no" : ""} onChange={e => onChange("decisionMaker", e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function BuyerFields({ data, onChange }: { data: Record<string, any>; onChange: (k: string, v: any) => void }) {
  return (
    <div className={sectionCls}>
      <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Buyer Details</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Buyer Type</label>
          <select className={selectCls} value={data.buyerType || ""} onChange={e => onChange("buyerType", e.target.value)}>
            <option value="">Select...</option>
            <option value="first-time">First-Time</option>
            <option value="investor">Investor</option>
            <option value="upgrade">Upgrade</option>
            <option value="downsize">Downsize</option>
            <option value="pied-a-terre">Pied-a-terre</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Property Type</label>
          <select className={selectCls} value={data.propertyType || ""} onChange={e => onChange("propertyType", e.target.value)}>
            <option value="">Select...</option>
            <option value="Condo">Condo</option>
            <option value="Co-op">Co-op</option>
            <option value="Townhouse">Townhouse</option>
            <option value="Multi-family">Multi-family</option>
            <option value="Land">Land</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Budget Min ($)</label>
          <input type="number" className={inputCls} value={data.budgetMin || ""} onChange={e => onChange("budgetMin", e.target.value ? Number(e.target.value) : undefined)} placeholder="500,000" />
        </div>
        <div>
          <label className={labelCls}>Budget Max ($)</label>
          <input type="number" className={inputCls} value={data.budgetMax || ""} onChange={e => onChange("budgetMax", e.target.value ? Number(e.target.value) : undefined)} placeholder="1,000,000" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Bedrooms (min)</label>
          <input type="number" className={inputCls} value={data.bedroomsMin || ""} onChange={e => onChange("bedroomsMin", e.target.value ? Number(e.target.value) : undefined)} placeholder="1" />
        </div>
        <div>
          <label className={labelCls}>Bedrooms (max)</label>
          <input type="number" className={inputCls} value={data.bedroomsMax || ""} onChange={e => onChange("bedroomsMax", e.target.value ? Number(e.target.value) : undefined)} placeholder="3" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Pre-Approved?</label>
          <select className={selectCls} value={data.preApproved === true ? "yes" : data.preApproved === false ? "no" : ""} onChange={e => onChange("preApproved", e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Cash Buyer?</label>
          <select className={selectCls} value={data.cashBuyer === true ? "yes" : data.cashBuyer === false ? "no" : ""} onChange={e => onChange("cashBuyer", e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Target Neighborhoods</label>
        <input className={inputCls} value={data.targetNeighborhoods?.join(", ") || ""} onChange={e => onChange("targetNeighborhoods", e.target.value ? e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined)} placeholder="Upper West Side, Park Slope, Williamsburg" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Move Timeline</label>
          <select className={selectCls} value={data.moveTimeline || ""} onChange={e => onChange("moveTimeline", e.target.value)}>
            <option value="">Select...</option>
            <option value="Immediately">Immediately</option>
            <option value="1-3 months">1-3 months</option>
            <option value="3-6 months">3-6 months</option>
            <option value="6-12 months">6-12 months</option>
            <option value="Flexible">Flexible</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Reason for Buying</label>
          <select className={selectCls} value={data.reasonForBuying || ""} onChange={e => onChange("reasonForBuying", e.target.value)}>
            <option value="">Select...</option>
            <option value="Investment">Investment</option>
            <option value="Primary residence">Primary Residence</option>
            <option value="Rental income">Rental Income</option>
            <option value="Flip">Flip</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function SellerFields({ data, onChange }: { data: Record<string, any>; onChange: (k: string, v: any) => void }) {
  return (
    <div className={sectionCls}>
      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Seller Details</p>
      <div>
        <label className={labelCls}>Property Address</label>
        <input className={inputCls} value={data.propertyAddress || ""} onChange={e => onChange("propertyAddress", e.target.value)} placeholder="123 Broadway, Apt 4A, New York, NY" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Property Type</label>
          <select className={selectCls} value={data.propertyType || ""} onChange={e => onChange("propertyType", e.target.value)}>
            <option value="">Select...</option>
            <option value="Condo">Condo</option>
            <option value="Co-op">Co-op</option>
            <option value="Townhouse">Townhouse</option>
            <option value="Multi-family">Multi-family</option>
            <option value="Land">Land</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Condition</label>
          <select className={selectCls} value={data.condition || ""} onChange={e => onChange("condition", e.target.value)}>
            <option value="">Select...</option>
            <option value="Excellent">Excellent</option>
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
            <option value="Needs work">Needs Work</option>
            <option value="Gut renovation">Gut Renovation</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Asking Price ($)</label>
          <input type="number" className={inputCls} value={data.askingPrice || ""} onChange={e => onChange("askingPrice", e.target.value ? Number(e.target.value) : undefined)} placeholder="1,200,000" />
        </div>
        <div>
          <label className={labelCls}>Mortgage Balance ($)</label>
          <input type="number" className={inputCls} value={data.mortgageBalance || ""} onChange={e => onChange("mortgageBalance", e.target.value ? Number(e.target.value) : undefined)} placeholder="500,000" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Reason for Selling</label>
          <select className={selectCls} value={data.reasonForSelling || ""} onChange={e => onChange("reasonForSelling", e.target.value)}>
            <option value="">Select...</option>
            <option value="Relocating">Relocating</option>
            <option value="Downsizing">Downsizing</option>
            <option value="Divorce">Divorce</option>
            <option value="Estate">Estate</option>
            <option value="Investment exit">Investment Exit</option>
            <option value="Distress">Distress</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Sell Timeline</label>
          <select className={selectCls} value={data.sellTimeline || ""} onChange={e => onChange("sellTimeline", e.target.value)}>
            <option value="">Select...</option>
            <option value="ASAP">ASAP</option>
            <option value="1-3 months">1-3 months</option>
            <option value="3-6 months">3-6 months</option>
            <option value="Flexible">Flexible</option>
            <option value="Testing the market">Testing the Market</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Owner Occupied?</label>
          <select className={selectCls} value={data.ownerOccupied === true ? "yes" : data.ownerOccupied === false ? "no" : ""} onChange={e => onChange("ownerOccupied", e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No (Tenant-Occupied)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Exclusive Agreement?</label>
          <select className={selectCls} value={data.exclusiveAgreement === true ? "yes" : data.exclusiveAgreement === false ? "no" : ""} onChange={e => onChange("exclusiveAgreement", e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Commission Rate (%)</label>
          <input type="number" step="0.5" className={inputCls} value={data.commissionRate || ""} onChange={e => onChange("commissionRate", e.target.value ? Number(e.target.value) : undefined)} placeholder="5" />
        </div>
        <div>
          <label className={labelCls}>Co-Broke Rate (%)</label>
          <input type="number" step="0.5" className={inputCls} value={data.cobrokeRate || ""} onChange={e => onChange("cobrokeRate", e.target.value ? Number(e.target.value) : undefined)} placeholder="2.5" />
        </div>
      </div>
    </div>
  );
}

function RenterFields({ data, onChange }: { data: Record<string, any>; onChange: (k: string, v: any) => void }) {
  return (
    <div className={sectionCls}>
      <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Renter Details</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Budget Min ($/mo)</label>
          <input type="number" className={inputCls} value={data.budgetMin || ""} onChange={e => onChange("budgetMin", e.target.value ? Number(e.target.value) : undefined)} placeholder="2,000" />
        </div>
        <div>
          <label className={labelCls}>Budget Max ($/mo)</label>
          <input type="number" className={inputCls} value={data.budgetMax || ""} onChange={e => onChange("budgetMax", e.target.value ? Number(e.target.value) : undefined)} placeholder="4,000" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Bedrooms</label>
          <select className={selectCls} value={data.bedrooms || ""} onChange={e => onChange("bedrooms", e.target.value)}>
            <option value="">Select...</option>
            <option value="Studio">Studio</option>
            <option value="1BR">1BR</option>
            <option value="2BR">2BR</option>
            <option value="3BR">3BR</option>
            <option value="4BR+">4BR+</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Move-In Date</label>
          <input type="date" className={inputCls} value={data.moveInDate || ""} onChange={e => onChange("moveInDate", e.target.value)} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Target Neighborhoods</label>
        <input className={inputCls} value={data.targetNeighborhoods?.join(", ") || ""} onChange={e => onChange("targetNeighborhoods", e.target.value ? e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined)} placeholder="East Village, LES, Williamsburg" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Annual Income ($)</label>
          <input type="number" className={inputCls} value={data.annualIncome || ""} onChange={e => onChange("annualIncome", e.target.value ? Number(e.target.value) : undefined)} placeholder="80,000" />
        </div>
        <div>
          <label className={labelCls}>Credit Score</label>
          <select className={selectCls} value={data.creditScore || ""} onChange={e => onChange("creditScore", e.target.value)}>
            <option value="">Unknown</option>
            <option value="Excellent (750+)">Excellent (750+)</option>
            <option value="Good (700-749)">Good (700-749)</option>
            <option value="Fair (650-699)">Fair (650-699)</option>
            <option value="Poor (<650)">Poor (&lt;650)</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Employment</label>
          <select className={selectCls} value={data.employmentStatus || ""} onChange={e => onChange("employmentStatus", e.target.value)}>
            <option value="">Select...</option>
            <option value="Employed">Employed</option>
            <option value="Self-employed">Self-Employed</option>
            <option value="Student">Student</option>
            <option value="Retired">Retired</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Guarantor</label>
          <select className={selectCls} value={data.guarantor || ""} onChange={e => onChange("guarantor", e.target.value)}>
            <option value="">Select...</option>
            <option value="Not needed">Not Needed</option>
            <option value="Has guarantor">Has Guarantor</option>
            <option value="Using service">Using Service (Insurent/Leap)</option>
            <option value="Needs one">Needs One</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Pets</label>
          <input className={inputCls} value={data.pets || ""} onChange={e => onChange("pets", e.target.value)} placeholder="Dog (small), Cat" />
        </div>
        <div>
          <label className={labelCls}>Broker Fee OK?</label>
          <select className={selectCls} value={data.brokerFee === true ? "yes" : data.brokerFee === false ? "no" : ""} onChange={e => onChange("brokerFee", e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No (Owner-Pay Only)</option>
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Urgency</label>
        <select className={selectCls} value={data.urgency || ""} onChange={e => onChange("urgency", e.target.value)}>
          <option value="">Select...</option>
          <option value="Immediate">Immediate (Lease Ending)</option>
          <option value="Soon">Soon (1-2 months)</option>
          <option value="Flexible">Flexible</option>
        </select>
      </div>
    </div>
  );
}
