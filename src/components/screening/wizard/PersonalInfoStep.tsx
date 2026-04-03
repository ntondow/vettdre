"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Loader2, AlertTriangle, ChevronRight } from "lucide-react";

interface Field {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "date" | "number" | "currency" | "ssn" | "boolean" | "select" | "textarea" | "file";
  required?: boolean;
  encrypted?: boolean;
  showIf?: { field: string; value: boolean | string };
}

interface Section {
  key: string;
  label: string;
  fields: Field[];
}

interface FieldConfig {
  sections: Section[];
  roleOverrides?: Record<string, { skip?: string[]; optional?: string[] }>;
}

const US_STATES = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
];

const PET_TYPES = [
  { value: "dog", label: "Dog" },
  { value: "cat", label: "Cat" },
  { value: "bird", label: "Bird" },
  { value: "fish", label: "Fish" },
  { value: "reptile", label: "Reptile" },
  { value: "small_animal", label: "Small Animal (hamster, rabbit, etc.)" },
  { value: "other", label: "Other" },
];

interface Props {
  fieldConfig: FieldConfig;
  applicantRole: string;
  initialData: Record<string, unknown>;
  onComplete: (formData: Record<string, unknown>) => void;
  saving: boolean;
}

export default function PersonalInfoStep({
  fieldConfig,
  applicantRole,
  initialData,
  onComplete,
  saving,
}: Props) {
  const [formData, setFormData] = useState<Record<string, unknown>>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fileUploads, setFileUploads] = useState<Record<string, File | null>>({});

  // Compute which sections to show based on role
  const visibleSections = useMemo(() => {
    const roleOverride = fieldConfig.roleOverrides?.[applicantRole] || {};
    return fieldConfig.sections.filter((section) => !roleOverride.skip?.includes(section.key));
  }, [fieldConfig, applicantRole]);

  // Helper: should show field based on showIf condition
  const shouldShowField = useCallback(
    (field: Field): boolean => {
      if (!field.showIf) return true;
      const depValue = formData[field.showIf.field];
      return depValue === field.showIf.value;
    },
    [formData]
  );

  // Helper: validate email
  const isValidEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  // Helper: validate phone
  const isValidPhone = (phone: string): boolean => {
    const re = /^\d{10,}$/;
    return re.test(phone.replace(/\D/g, ""));
  };

  // Helper: format SSN input (mask)
  const formatSsn = (value: string): string => {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 0) return "";
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
  };

  // Helper: format currency
  const formatCurrency = (value: string): string => {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    return (parseInt(digits, 10) / 100).toFixed(2);
  };

  // Handle field change
  const handleChange = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    for (const section of visibleSections) {
      for (const field of section.fields) {
        if (!shouldShowField(field)) continue;

        const value = formData[field.key];

        if (field.required) {
          if (field.type === "boolean") {
            if (value !== true && value !== false) {
              newErrors[field.key] = `${field.label} is required`;
              continue;
            }
          } else if (!value || String(value).trim() === "") {
            newErrors[field.key] = `${field.label} is required`;
            continue;
          }
        }

        if (value && String(value).trim() !== "") {
          if (field.type === "email" && !isValidEmail(String(value))) {
            newErrors[field.key] = "Please enter a valid email address";
          } else if (field.type === "tel" && !isValidPhone(String(value))) {
            newErrors[field.key] = "Please enter a valid phone number";
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle submit
  const handleSubmit = () => {
    if (validateForm()) {
      onComplete(formData);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Form Sections */}
      {visibleSections.map((section) => (
        <div key={section.key}>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-4">
            {section.label}
          </h2>

          <div className="space-y-4 sm:space-y-5">
            {section.fields.map((field) => {
              if (!shouldShowField(field)) return null;

              const value = String(formData[field.key] ?? "");
              const error = errors[field.key];

              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>

                  {field.type === "select" ? (
                    <select
                      value={value}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className={`w-full rounded-lg border px-4 py-2.5 sm:py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                        error
                          ? "border-red-300 bg-red-50 focus:ring-red-500"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      <option value="">Select {field.label.toLowerCase()}</option>
                      {field.key === "currentState" &&
                        US_STATES.map((state) => (
                          <option key={state.value} value={state.value}>
                            {state.label}
                          </option>
                        ))}
                      {field.key === "petType" &&
                        PET_TYPES.map((pt) => (
                          <option key={pt.value} value={pt.value}>
                            {pt.label}
                          </option>
                        ))}
                    </select>
                  ) : field.type === "boolean" ? (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleChange(field.key, true)}
                        className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                          formData[field.key] === true
                            ? "border-blue-600 bg-blue-50 text-blue-900"
                            : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          formData[field.key] === true ? "border-blue-600" : "border-slate-300"
                        }`}>
                          {formData[field.key] === true && (
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                          )}
                        </div>
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChange(field.key, false)}
                        className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                          formData[field.key] === false
                            ? "border-blue-600 bg-blue-50 text-blue-900"
                            : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          formData[field.key] === false ? "border-blue-600" : "border-slate-300"
                        }`}>
                          {formData[field.key] === false && (
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                          )}
                        </div>
                        No
                      </button>
                    </div>
                  ) : field.type === "textarea" ? (
                    <textarea
                      value={value}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={field.label}
                      rows={3}
                      className={`w-full rounded-lg border px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors resize-none ${
                        error
                          ? "border-red-300 bg-red-50 focus:ring-red-500"
                          : "border-slate-300 bg-white"
                      }`}
                    />
                  ) : field.type === "file" ? (
                    <div>
                      <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer hover:bg-slate-50 transition-colors border-slate-300">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          {fileUploads[field.key] ? (
                            <p className="text-sm text-green-600 font-medium">{fileUploads[field.key]!.name}</p>
                          ) : (
                            <>
                              <p className="text-sm text-slate-500">Click to upload</p>
                              <p className="text-xs text-slate-400 mt-1">JPG, PNG or HEIC</p>
                            </>
                          )}
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setFileUploads((prev) => ({ ...prev, [field.key]: file }));
                            handleChange(field.key, file ? file.name : "");
                          }}
                        />
                      </label>
                    </div>
                  ) : field.type === "currency" ? (
                    <div className="relative">
                      <span className="absolute left-4 top-2.5 sm:top-2 text-sm font-medium text-slate-400">
                        $
                      </span>
                      <input
                        type="text"
                        value={formatCurrency(value)}
                        onChange={(e) =>
                          handleChange(field.key, e.target.value.replace(/[^0-9.]/g, ""))
                        }
                        placeholder="0.00"
                        className={`w-full rounded-lg border px-4 py-2.5 sm:py-2 pl-8 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                          error
                            ? "border-red-300 bg-red-50 focus:ring-red-500"
                            : "border-slate-300 bg-white"
                        }`}
                      />
                    </div>
                  ) : field.type === "ssn" ? (
                    <input
                      type="password"
                      value={value}
                      onChange={(e) => handleChange(field.key, formatSsn(e.target.value))}
                      placeholder="000-00-0000"
                      inputMode="numeric"
                      className={`w-full rounded-lg border px-4 py-2.5 sm:py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                        error
                          ? "border-red-300 bg-red-50 focus:ring-red-500"
                          : "border-slate-300 bg-white"
                      }`}
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={value}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={field.label}
                      inputMode={field.type === "tel" ? "tel" : field.type === "number" ? "numeric" : "text"}
                      className={`w-full rounded-lg border px-4 py-2.5 sm:py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                        error
                          ? "border-red-300 bg-red-50 focus:ring-red-500"
                          : "border-slate-300 bg-white"
                      }`}
                    />
                  )}

                  {error && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-red-600">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      {error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={saving}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            Continue
            <ChevronRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  );
}
