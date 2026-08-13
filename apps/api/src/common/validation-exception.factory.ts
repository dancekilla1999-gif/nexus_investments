import { BadRequestException, ValidationError } from '@nestjs/common';

export interface FieldError {
  field: string;
  messages: string[];
}

/**
 * Turns class-validator's ValidationError tree into a flat, field-addressable list so the
 * client can highlight the exact input that failed instead of parsing prose
 * (docs/04-api-architecture.md §8 — the error contract is structured, not a sentence to grep).
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const details = flatten(errors);
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'One or more fields are invalid.',
    details,
  });
}

function flatten(errors: ValidationError[], parentPath = ''): FieldError[] {
  return errors.flatMap((error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own: FieldError[] = error.constraints
      ? [{ field: path, messages: Object.values(error.constraints) }]
      : [];
    const nested = error.children?.length ? flatten(error.children, path) : [];
    return [...own, ...nested];
  });
}
