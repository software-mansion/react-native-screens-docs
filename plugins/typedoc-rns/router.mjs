import { MemberRouter } from 'typedoc-plugin-markdown';
import { ReflectionKind } from 'typedoc';

import {
  FEATURES,
  componentFor,
  outputRoot,
  platformDirOf,
} from './feature-map.mjs';

// The hand-written page of a family is its Overview; TypeDoc's own module index, the
// namespace pages and the component functions would only duplicate what the props type
// already documents.
const SUPPRESSED_KINDS =
  ReflectionKind.Module |
  ReflectionKind.Namespace |
  ReflectionKind.Variable |
  ReflectionKind.Function;

function moduleOf(reflection) {
  let current = reflection;
  while (current && current.kind !== ReflectionKind.Module) {
    current = current.parent;
  }
  return current;
}

/**
 * Writes the reference into the docs tree the feature map describes, instead of TypeDoc's
 * own `<module>/<kind>/<name>` layout:
 *
 *   react/containers/stack/api-reference/host/_host.mdx
 *   react/containers/stack/api-reference/types/android/_StackHeaderTypeAndroid.mdx
 *
 * `MemberRouter` is the plugin's public base class; `getIdealBaseName` and
 * `shouldWritePage` are its documented extension points.
 */
export class RnsRouter extends MemberRouter {
  #featureOf(reflection) {
    const module = moduleOf(reflection);
    const feature = module && FEATURES[module.name];
    if (!feature) {
      throw new Error(
        `[typedoc-rns] No feature-map entry for module "${module?.name}" ` +
          `(routing "${reflection.getFullName()}"). Add it to plugins/typedoc-rns/feature-map.mjs.`,
      );
    }
    return feature;
  }

  getIdealBaseName(reflection) {
    const feature = this.#featureOf(reflection);
    const root = outputRoot(feature);
    if (reflection.kindOf(ReflectionKind.Module)) {
      return `${root}/_index`;
    }
    const component = componentFor(feature, reflection);
    if (component) {
      return `${root}/${component.id}/_${component.id}`;
    }
    // Types split by the platform they are documented for; one that is not platform-specific
    // is shared. The grouping reads `@platform` only — nothing is inferred from file names
    // or from an `*IOS` / `*Android` suffix, which `BlurEffect` and `PlatformIconIOSSfSymbol`
    // would get wrong in both directions.
    const platform = platformDirOf(reflection) || 'shared';
    return `${root}/types/${platform}/_${this.getReflectionAlias(reflection)}`;
  }

  shouldWritePage(reflection) {
    if (reflection.kindOf(SUPPRESSED_KINDS)) {
      return false;
    }
    // A merged reflection documents inside its component's page, so it gets a URL but no
    // file of its own.
    const component = componentFor(this.#featureOf(reflection), reflection);
    if (component && component.props !== reflection.name) {
      return false;
    }
    return super.shouldWritePage(reflection);
  }
}
