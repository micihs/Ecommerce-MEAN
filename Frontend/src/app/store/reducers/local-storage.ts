import { INIT as INIT_ACTION, UPDATE as UPDATE_ACTION } from '@ngrx/store';
import deepmerge from 'deepmerge';

export const localStorageSync = (config) => (reducer: any) => {
    if (
        (config.storage === undefined && !config.checkStorageAvailability) ||
        (config.checkStorageAvailability && typeof window !== 'undefined')
    ) {
        config.storage = localStorage || window.localStorage;
    }

    if (config.storageKeySerializer === undefined) {
        config.storageKeySerializer = (key) => key;
    }

    if (config.restoreDates === undefined) {
        config.restoreDates = true;
    }

    let mergeReducer = config.mergeReducer;

    if (mergeReducer === undefined || typeof mergeReducer !== 'function') {
        mergeReducer = defaultMergeReducer;
    }

    const stateKeys = validateStateKeys(config.keys);
    const rehydratedState = config.rehydrate
        ? rehydrateApplicationState(stateKeys, config.storage, config.storageKeySerializer, config.restoreDates)
        : undefined;

  return function (state: any, action: any) {
        let nextState: any;
        if (action.type === INIT_ACTION && !state) {
            nextState = reducer(state, action);
        } else {
            nextState = { ...state };
        }
        nextState = mergeReducer(nextState, rehydratedState, action);
        nextState = reducer(nextState, action);
        if (action.type !== INIT_ACTION) {
            syncStateUpdate(
                nextState,
                stateKeys,
                config.storage,
                config.storageKeySerializer as (key: string | number) => string,
                config.removeOnUndefined,
                config.syncCondition
            );
        }
    return nextState;
  };
};

const validateStateKeys = (keys) => {
  return (keys as any[]).map((key) => {
      let attr = key;

      if (typeof key === 'object') {
          attr = Object.keys(key)[0];
      }

      if (typeof attr !== 'string') {
          throw new TypeError(
              `localStorageSync Unknown Parameter Type: ` + `Expected type of string, got ${typeof attr}`
          );
      }
      return key;
  });
};

export const rehydrateApplicationState = (
    keys,
    storage: Storage,
    storageKeySerializer: (key: string) => string,
    restoreDates: boolean
    ) => {
    return (keys as any[]).reduce((acc, curr) => {
        let key = curr;
        let reviver = restoreDates ? dateReviver : dummyReviver;
        let deserialize: (arg0: string) => any;
        let decrypt: (arg0: string) => string;

        if (typeof key === 'object') {
            key = Object.keys(key)[0];
            if (typeof curr[key] === 'function') {
                reviver = curr[key];
            } else {
                if (curr[key].reviver) {
                    reviver = curr[key].reviver;
                }
                if (curr[key].deserialize) {
                    deserialize = curr[key].deserialize;
                }
            }
            if (curr[key].encrypt && curr[key].decrypt) {
                if (typeof curr[key].encrypt === 'function' && typeof curr[key].decrypt === 'function') {
                    decrypt = curr[key].decrypt;
                } else {
                    console.error(`Either encrypt or decrypt is not a function on '${curr[key]}' key object.`);
                }
            } else if (curr[key].encrypt || curr[key].decrypt) {
                console.error(`Either encrypt or decrypt function is not present on '${curr[key]}' key object.`);
            }
        }
        if (storage !== undefined) {
            let stateSlice = storage.getItem(storageKeySerializer(key));
            if (stateSlice) {
                if (decrypt) {
                    stateSlice = decrypt(stateSlice);
                }

                const isObjectRegex = new RegExp('{|\\[');
                let raw = stateSlice;
                if (stateSlice === 'null' || stateSlice === 'true' || stateSlice === 'false' || isObjectRegex.test(stateSlice.charAt(0))) {
                    raw = JSON.parse(stateSlice, reviver);
                }
                return Object.assign({}, acc, {
                    [key]: deserialize ? deserialize(raw) : raw,
                });
            }
        }
        return acc;
    }, {});
};

export const syncStateUpdate = (
  state: any,
  keys,
  storage: Storage,
  storageKeySerializer: (key: string | number) => string,
  removeOnUndefined: boolean,
  syncCondition?: (state: any) => any
) => {
  if (syncCondition) {
      try {
          if (syncCondition(state) !== true) {
              return;
          }
      } catch (e) {
          if (e instanceof TypeError) {
              return;
          }
          throw e;
      }
  }

  keys.forEach((key: string | any | ((key: string, value: any) => any)): void => {
      let stateSlice = state[key as string];
      let replacer;
      let space: string | number;
      let encrypt;

      if (typeof key === 'object') {
          let name = Object.keys(key)[0];
          stateSlice = state[name];

          if (typeof stateSlice !== 'undefined' && key[name]) {
              if (key[name].serialize) {
                  stateSlice = key[name].serialize(stateSlice);
              } else {
                  let filter: any[];
                  if (key[name].reduce) {
                      filter = key[name];
                  } else if (key[name].filter) {
                      filter = key[name].filter;
                  }
                  if (filter) {
                      stateSlice = createStateSlice(stateSlice, filter);
                  }

                  if (key[name].encrypt && key[name].decrypt) {
                      if (typeof key[name].encrypt === 'function') {
                          encrypt = key[name].encrypt;
                      }
                  } else if (key[name].encrypt || key[name].decrypt) {
                      console.error(
                          `Either encrypt or decrypt function is not present on '${key[name]}' key object.`
                      );
                  }
              }
              replacer = key[name].replacer;
              space = key[name].space;
          }

          key = name;
      }

      if (typeof stateSlice !== 'undefined' && storage !== undefined) {
          try {
              if (encrypt) {
                  stateSlice = encrypt(
                      typeof stateSlice === 'string' ? stateSlice : JSON.stringify(stateSlice, replacer, space)
                  );
              }
              storage.setItem(
                  storageKeySerializer(key as string),
                  typeof stateSlice === 'string' ? stateSlice : JSON.stringify(stateSlice, replacer, space)
              );
          } catch (e) {
              console.warn('Unable to save state to localStorage:', e);
          }
      } else if (typeof stateSlice === 'undefined' && removeOnUndefined && storage !== undefined) {
          try {
              storage.removeItem(storageKeySerializer(key as string));
          } catch (e) {
              console.warn(`Exception on removing/cleaning undefined '${key}' state`, e);
          }
      }
  });
};

function createStateSlice(existingSlice: any, filter: (string | number | any)[]) {
    return filter.reduce(
        (memo: { [x: string]: any; [x: number]: any }, attr: string | number | any ) => {
            if (typeof attr === 'string' || typeof attr === 'number') {
                const value = existingSlice?.[attr];
                if (value !== undefined) {
                    memo[attr] = value;
                }
            } else {
                for (const key in attr) {
                    if (Object.prototype.hasOwnProperty.call(attr, key)) {
                        const element = attr[key];
                        memo[key] = createStateSlice(existingSlice[key], element);
                    }
                }
            }
            return memo;
        },
        {}
    );
}

const detectDate = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;
export const dateReviver = (_key: string, value: any) => {
    if (typeof value === 'string' && detectDate.test(value)) {
        return new Date(value);
    }
    return value;
};
const dummyReviver = (_key: string, value: any) => value;

export const defaultMergeReducer = (state: any, rehydratedState: any, action: any) => {
    if ((action.type === INIT_ACTION || action.type === UPDATE_ACTION) && rehydratedState) {
        const overwriteMerge = (destinationArray: any, sourceArray: any, options: any) => sourceArray;
        const options = {
            arrayMerge: overwriteMerge,
        };

        state = deepmerge(state, rehydratedState, options);
    }

    return state;
};