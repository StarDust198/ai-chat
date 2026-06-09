import { ReactNode } from "react";
import {
  Controller,
  FieldValues,
  FieldPath,
  ControllerRenderProps,
  ControllerProps,
} from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "../ui/field";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export type FormBaseProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = {
  name: TName;
  control: ControllerProps<TFieldValues, TName, TTransformedValues>["control"];
  label?: ReactNode;
  description?: ReactNode;
  children: (
    field: ControllerRenderProps<TFieldValues, TName> & {
      "aria-invalid": boolean;
      id: string;
    },
  ) => ReactNode;
};

export type FormTextareaProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = {
  name: TName;
  control: ControllerProps<TFieldValues, TName, TTransformedValues>["control"];
  label?: ReactNode;
  description?: ReactNode;
};

export type FormSelectProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = {
  name: TName;
  control: ControllerProps<TFieldValues, TName, TTransformedValues>["control"];
  label?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  getTriggerText?: (option: string) => ReactNode;
};

export function FormBase<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>({
  name,
  label,
  description,
  control,
  children,
}: FormBaseProps<TFieldValues, TName, TTransformedValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        return (
          <Field data-invalid={fieldState.invalid}>
            {!!(label || description) && (
              <FieldContent>
                {!!label && (
                  <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
                )}

                {!!description && (
                  <FieldDescription>{description}</FieldDescription>
                )}
              </FieldContent>
            )}

            {children({
              ...field,
              "aria-invalid": fieldState.invalid,
              id: field.name,
            })}

            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        );
      }}
    />
  );
}

export function FormTextarea<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>({
  name,
  label,
  description,
  control,
}: FormTextareaProps<TFieldValues, TName, TTransformedValues>) {
  return (
    <FormBase
      name={name}
      control={control}
      description={description}
      label={label}
    >
      {(field) => (
        <Textarea {...field} className="shrink-0 min-h-20 resize-none" />
      )}
    </FormBase>
  );
}

export function FormSelect<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>({
  name,
  label,
  description,
  control,
  getTriggerText,
  children,
}: FormSelectProps<TFieldValues, TName, TTransformedValues>) {
  return (
    <FormBase
      name={name}
      control={control}
      description={description}
      label={label}
    >
      {({ onChange, onBlur, ...field }) => (
        <Select {...field} onValueChange={onChange}>
          <SelectTrigger
            onBlur={onBlur}
            id={field.id}
            aria-invalid={field["aria-invalid"]}
            className="w-full max-w-48"
          >
            <SelectValue placeholder="Select a model">
              {(value: string) =>
                getTriggerText ? getTriggerText(value) : value
              }
            </SelectValue>
          </SelectTrigger>

          <SelectContent id={field.name}>{children}</SelectContent>
        </Select>
      )}
    </FormBase>
  );
}
