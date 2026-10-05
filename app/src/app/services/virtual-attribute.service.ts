/*
 * Copyright (C) 2026 BrainBoutique Solutions GmbH (Wilko Hein)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org>.
 */

import { Injectable } from '@angular/core';
import Interpreter from 'js-interpreter';
import type { CustomFieldDefinition } from './model-definitions.service';

interface CachedInterpreter {
  interp: Interpreter;
  globalObject: object;
}

@Injectable({ providedIn: 'root' })
export class VirtualAttributeService {

  private interpreterCache = new Map<string, CachedInterpreter>();

  /**
   * Evaluate a single formula against an entity and return the result.
   * The formula can reference entity properties via `$` (e.g. `$.costTotal`).
   * Interpreters are cached per formula to avoid re-instantiation.
   */
  evaluateFormula(formula: string, entity: Record<string, unknown>): unknown {
    try {
      //const scalarMap = this.toScalarMap(entity);
      let cached = this.interpreterCache.get(formula);
      if (!cached) {
        const code = `var __result = ${formula};`;
        let globalObj: object;
        const interp = new Interpreter(code, (interpreter, globalObject) => {
          globalObj = globalObject;
          interpreter.setProperty(globalObject, '$', interpreter.nativeToPseudo(entity));
        });
        interp.run();
        cached = { interp, globalObject: globalObj! };
        this.interpreterCache.set(formula, cached);
      } else {
        cached.interp.setProperty(cached.globalObject, '$', cached.interp.nativeToPseudo(entity));
        cached.interp.appendCode(`__result = ${formula};`);
        cached.interp.run();
      }
      const raw = cached.interp.getValueFromScope('__result');
      return cached.interp.pseudoToNative(raw);
    } catch(err) {
      console.error("Error evaluating formula",formula,err);
      return null;
    }
  }

  /**
   * Compute all virtual attributes on an entity in-place.
   * Reads `formula` from each virtual field definition, evaluates it,
   * and sets the result as a property on the entity object.
   */
  computeVirtualAttributes(
    entity: Record<string, unknown>,
    virtualDefs: Record<string, CustomFieldDefinition>
  ): void {
    for (const [key, def] of Object.entries(virtualDefs)) {
      if (def.type !== 'virtual' || !def.formula) continue;
      const result = this.evaluateFormula(def.formula, entity);
      entity[key] = result;
    }
  }
}
