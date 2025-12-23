"use client";

import * as React from "react";
import { Plus, X, Calendar } from "lucide-react";
import { HistoryFormData, ServiceRecord, REASONS_FOR_SELLING } from "@/lib/types/listing";
import { FormField, SectionHeader, InfoBox, PriceInput } from "./form-elements";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 5: History & Provenance
// ============================================================

interface Step5HistoryProps {
  data: HistoryFormData;
  onChange: (data: HistoryFormData) => void;
  errors?: ValidationError[];
}

export function Step5History({ data, onChange, errors = [] }: Step5HistoryProps) {
  const [neverServiced, setNeverServiced] = React.useState(false);
  const [otherReason, setOtherReason] = React.useState("");

  const updateField = <K extends keyof HistoryFormData>(
    field: K,
    value: HistoryFormData[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  const addServiceRecord = () => {
    const newRecord: ServiceRecord = {
      date: new Date().toISOString().split("T")[0],
      shop: "",
      work_done: "",
    };
    updateField("serviceHistory", [...(data.serviceHistory || []), newRecord]);
  };

  const updateServiceRecord = (index: number, field: keyof ServiceRecord, value: string) => {
    const updated = [...(data.serviceHistory || [])];
    updated[index] = { ...updated[index], [field]: value };
    updateField("serviceHistory", updated);
  };

  const removeServiceRecord = (index: number) => {
    const updated = (data.serviceHistory || []).filter((_, i) => i !== index);
    updateField("serviceHistory", updated);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">History & Provenance</h2>
        <p className="text-gray-600">
          Tell buyers about the item's history - it adds value and trust
        </p>
      </div>

      {/* Purchase Information */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Purchase Information"
          description="Where and when did you get this item?"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            label="Purchased From (Optional)"
            hint="Store name, website, or 'Private sale'"
          >
            <Input
              value={data.purchaseLocation || ""}
              onChange={(e) => updateField("purchaseLocation", e.target.value)}
              placeholder="e.g., Local bike shop, BikeExchange"
              className="rounded-md"
            />
          </FormField>

          <FormField
            label="Purchase Date (Optional)"
            hint="Helps establish age and value"
            error={getFieldError(errors, "purchaseDate")}
          >
            <Input
              type="date"
              value={data.purchaseDate || ""}
              onChange={(e) => updateField("purchaseDate", e.target.value)}
              className="rounded-md"
              max={new Date().toISOString().split("T")[0]}
            />
          </FormField>

          <div className="md:col-span-2">
            <FormField
              label="Original RRP (Optional)"
              hint="What did you pay new? Helps buyers understand the deal"
              error={getFieldError(errors, "originalRrp")}
            >
              <PriceInput
                value={data.originalRrp}
                onChange={(value) => updateField("originalRrp", value)}
                placeholder="0.00"
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* Service History */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Service History"
          description="Maintenance and service records (especially important for bikes)"
        />

        <div className="flex items-center space-x-2">
          <Checkbox
            id="never-serviced"
            checked={neverServiced}
            onCheckedChange={(checked) => {
              setNeverServiced(checked as boolean);
              if (checked) {
                updateField("serviceHistory", []);
              }
            }}
          />
          <Label
            htmlFor="never-serviced"
            className="text-sm font-medium text-gray-900 cursor-pointer"
          >
            This item has never been serviced (new or minimal use)
          </Label>
        </div>

        {!neverServiced && (
          <div className="space-y-4">
            {(data.serviceHistory || []).map((record, index) => (
              <div
                key={index}
                className="bg-gray-50 rounded-md p-4 space-y-4 border border-gray-200"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-900">
                    Service Record {index + 1}
                  </h4>
                  <button
                    type="button"
                    onClick={() => removeServiceRecord(index)}
                    className="text-red-600 hover:text-red-700 text-sm"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Service Date">
                    <Input
                      type="date"
                      value={record.date}
                      onChange={(e) => updateServiceRecord(index, "date", e.target.value)}
                      className="rounded-md"
                      max={new Date().toISOString().split("T")[0]}
                    />
                  </FormField>

                  <FormField label="Shop/Mechanic">
                    <Input
                      value={record.shop}
                      onChange={(e) => updateServiceRecord(index, "shop", e.target.value)}
                      placeholder="e.g., Local Bike Co."
                      className="rounded-md"
                    />
                  </FormField>

                  <div className="md:col-span-2">
                    <FormField label="Work Performed">
                      <Textarea
                        value={record.work_done}
                        onChange={(e) =>
                          updateServiceRecord(index, "work_done", e.target.value)
                        }
                        placeholder="e.g., Full tune-up, replaced chain and cassette, adjusted brakes"
                        className="rounded-md min-h-[80px]"
                      />
                    </FormField>
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              onClick={addServiceRecord}
              variant="outline"
              className="w-full rounded-md"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Service Record
            </Button>
          </div>
        )}

        <InfoBox>
          <p>
            <strong>💡 Tip:</strong> Well-documented service history significantly increases
            buyer confidence. Even basic maintenance records show you've cared for the item.
          </p>
        </InfoBox>
      </div>

      {/* Modifications & Upgrades */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Modifications & Upgrades"
          description="Any changes from the original specification?"
        />

        <FormField
          label="Upgrades & Modifications (Optional)"
          hint="List any parts you've upgraded or modifications made"
          error={getFieldError(errors, "upgradesModifications")}
        >
          <Textarea
            value={data.upgradesModifications || ""}
            onChange={(e) => updateField("upgradesModifications", e.target.value)}
            placeholder="e.g., Upgraded to carbon wheels (Zipp 303), installed tubeless tyres, added power meter"
            className="rounded-md min-h-[120px]"
            maxLength={1000}
          />
        </FormField>
      </div>

      {/* Reason for Selling */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Reason for Selling"
          description="Why are you selling? (optional but builds trust)"
        />

        <FormField label="Reason (Optional)">
          <Select
            value={
              REASONS_FOR_SELLING.includes(data.reasonForSelling as any)
                ? data.reasonForSelling
                : "Other"
            }
            onValueChange={(value) => {
              if (value === "Other") {
                updateField("reasonForSelling", otherReason);
              } else {
                updateField("reasonForSelling", value);
                setOtherReason("");
              }
            }}
          >
            <SelectTrigger className="rounded-md">
              <SelectValue placeholder="Select reason" />
            </SelectTrigger>
            <SelectContent>
              {REASONS_FOR_SELLING.map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {reason}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {(!REASONS_FOR_SELLING.includes(data.reasonForSelling as any) ||
          data.reasonForSelling === "Other") && (
          <FormField label="Please specify">
            <Input
              value={otherReason || data.reasonForSelling || ""}
              onChange={(e) => {
                setOtherReason(e.target.value);
                updateField("reasonForSelling", e.target.value);
              }}
              placeholder="Tell buyers why you're selling"
              className="rounded-md"
            />
          </FormField>
        )}

        <InfoBox>
          <p>
            <strong>Example:</strong> "Upgrading to a new model" or "Switching to gravel
            riding" gives context and shows there's nothing wrong with the item.
          </p>
        </InfoBox>
      </div>
    </div>
  );
}











