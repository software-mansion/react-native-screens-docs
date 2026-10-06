import { MemberRouter } from 'typedoc-plugin-markdown';
import {
  ReflectionKind,
  Slugger,
  type DeclarationReflection,
  type PageDefinition,
  type ProjectReflection,
  type Reflection,
  type RouterTarget,
} from 'typedoc';

import {
  FEATURES,
  type Feature,
  type Platform,
  anchorSlug,
  componentFor,
  linkTarget,
  outputFile,
  outputRoot,
  platformDirOf,
} from './feature-map.mjs';

/** One section of a family page: a component's props, or a type. */
export interface Section {
  kind: 'component' | 'type';
  model: DeclarationReflection;
  title: string;
  anchor: string;
  /** The section's file, relative to the family's `api-reference/` (set once routed). */
  part?: string;
}

/** A family page: its feature and its sections in page order. */
export interface Layout {
  feature: Feature;
  sections: Section[];
}

// The hand-written page of a family is its Overview; TypeDoc's own module index, the
// namespace pages and the component functions would only duplicate what the props type
// already documents.
const SUPPRESSED_KINDS =
  ReflectionKind.Module |
  ReflectionKind.Namespace |
  ReflectionKind.Variable |
  ReflectionKind.Function;

/** Walks a container's descendants, namespaces included (`Tabs.Host` lives in one). */
function visitReflections(
  container: Reflection | undefined,
  visit: (reflection: Reflection) => void,
): void {
  container?.traverse(child => {
    visit(child);
    if (child.kindOf(ReflectionKind.Namespace | ReflectionKind.Variable)) {
      visitReflections(child, visit);
    }
    return true;
  });
}

function moduleOf(reflection: Reflection | undefined): Reflection | undefined {
  let current = reflection;
  while (current && current.kind !== ReflectionKind.Module) {
    current = current.parent;
  }
  return current;
}

// Types are listed shared first, then the platform-specific ones.
const PLATFORM_ORDER: Record<Platform | '', number> = { '': 0, ios: 1, android: 2 };

/**
 * Writes the reference into the docs tree the feature map describes, instead of TypeDoc's
 * own `<module>/<kind>/<name>` layout, and folds each family into ONE page assembled from
 * those files:
 *
 *   react/containers/stack/api-reference/
 *     _api-reference.mdx                          imports the parts below, in page order
 *     host/_host.mdx                              the Host section
 *     types/android/_StackHeaderTypeAndroid.mdx   one type per file
 *
 * `MemberRouter` is the plugin's public base class; `getIdealBaseName`, `shouldWritePage`
 * and `buildPages` are its documented extension points. Its types still mark
 * `shouldWritePage` as private, hence the two `@ts-expect-error`s.
 */
// @ts-expect-error -- `shouldWritePage` is private in the plugin's types (see above)
export class RnsRouter extends MemberRouter {
  /** page model → { feature, sections } */
  #layouts = new Map<RouterTarget, Layout>();
  /** the models rendered as a section of a page */
  #sections = new Set<RouterTarget>();

  /** The layout of the page this model renders, or `undefined` for anything else. */
  pageLayout(model: RouterTarget): Layout | undefined {
    return this.#layouts.get(model);
  }

  /** The doc that links on this page resolve against — the page, not the part file. */
  linkFileFor(model: RouterTarget): string | undefined {
    const layout = this.pageLayout(model);
    return layout ? `${linkTarget(layout.feature)}${this.extension}` : undefined;
  }

  isSectionModel(model: RouterTarget): boolean {
    return this.#sections.has(model);
  }

  #featureOf(reflection: Reflection): Feature {
    const module = moduleOf(reflection);
    const feature = module && FEATURES[module.name];
    if (!feature) {
      throw new Error(
        `[typedoc-rns] No feature-map entry for module "${module?.name}" ` +
          `(routing "${reflection.getFullName()}"). Add it to plugins/typedoc-rns/feature-map.mts.`,
      );
    }
    return feature;
  }

  override getIdealBaseName(reflection: Reflection): string {
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

  override buildChildPages(reflection: Reflection, outPages: PageDefinition[]): void {
    // A suppressed reflection gets no slugger of its own, so its members would be slugged on
    // the project-wide one and could drift from the identically named headings of the page
    // they merge into. A fresh slugger reproduces that page's sequence.
    if (
      this.getPageKind(reflection) &&
      !this.shouldWritePage(reflection) &&
      !this.sluggers.has(reflection)
    ) {
      this.sluggers.set(reflection, new Slugger(this.sluggerConfiguration));
    }
    super.buildChildPages(reflection, outPages);
  }

  override buildPages(project: ProjectReflection): PageDefinition[] {
    const pages = super.buildPages(project).filter(page => page.model !== project);
    const byFeature = new Map<Feature, PageDefinition[]>();
    for (const page of pages) {
      // No module name finds no feature, same as an unknown name.
      const feature = FEATURES[moduleOf(page.model as Reflection)?.name as string];
      if (!feature) continue;
      byFeature.set(feature, [...(byFeature.get(feature) ?? []), page]);
    }

    // section model → the anchor its own heading and its members are prefixed with
    const anchors = new Map<RouterTarget, string>();
    const result: PageDefinition[] = [];

    for (const [feature, featurePages] of byFeature) {
      // The pages MemberRouter builds for a family are all declarations.
      const models = featurePages.map(page => page.model as DeclarationReflection);
      const sections: Section[] = [];

      for (const component of feature.components) {
        const model = models.find(candidate => candidate.name === component.props);
        if (!model) {
          throw new Error(
            `[typedoc-rns] "${component.props}" (${feature.label}/${component.label}) is not ` +
              'in the public surface. Fix feature-map.mts or the library barrel.',
          );
        }
        anchors.set(model, component.id);
        sections.push({ kind: 'component', model, title: component.label, anchor: component.id });
      }

      const componentModels = new Set(sections.map(section => section.model));
      const types = models
        .filter(model => !componentModels.has(model))
        .sort(
          (a, b) =>
            PLATFORM_ORDER[platformDirOf(a)] - PLATFORM_ORDER[platformDirOf(b)] ||
            a.name.localeCompare(b.name),
        );
      for (const model of types) {
        anchors.set(model, anchorSlug(model.name));
        sections.push({ kind: 'type', model, title: model.name, anchor: anchorSlug(model.name) });
      }

      // A merged reflection resolves onto the section it documents in.
      visitReflections(moduleOf(models[0]), reflection => {
        const component = componentFor(feature, reflection);
        if (component && reflection.name !== component.props) {
          anchors.set(reflection, component.id);
        }
      });

      const root = outputRoot(feature);
      for (const section of sections) {
        section.part = this.getIdealBaseName(section.model).slice(root.length + 1);
        this.#sections.add(section.model);
      }

      const pageModel = sections[0]!.model;
      this.#layouts.set(pageModel, { feature, sections });
      result.push({
        ...featurePages.find(page => page.model === pageModel)!,
        url: `${outputFile(feature)}${this.extension}`,
      });
    }

    this.#rewriteUrls(anchors);
    return result;
  }

  /**
   * Everything a family declares now lives on one page, so every URL becomes that page's
   * URL plus an anchor, and every member's anchor is prefixed with its section's — without
   * it, `title` of one type and `title` of the next would collide.
   */
  #rewriteUrls(anchors: Map<RouterTarget, string>): void {
    for (const reflection of [...this.fullUrls.keys()]) {
      const feature = FEATURES[moduleOf(reflection as Reflection)?.name as string];
      if (!feature) continue;
      const url = `${linkTarget(feature)}${this.extension}`;

      let section: RouterTarget | undefined = reflection;
      while (section && !anchors.has(section)) section = section.parent;
      if (!section) {
        this.fullUrls.set(reflection, url);
        this.anchors.delete(reflection);
        continue;
      }

      const prefix = anchors.get(section)!;
      const anchor =
        section === reflection
          ? prefix
          : `${prefix}-${this.anchors.get(reflection) ?? anchorSlug(reflection.name)}`;
      this.fullUrls.set(reflection, `${url}#${anchor}`);
      this.anchors.set(reflection, anchor);
    }
  }

  shouldWritePage(reflection: Reflection): boolean {
    if (reflection.kindOf(SUPPRESSED_KINDS)) {
      return false;
    }
    // A merged reflection documents inside its component's page, so it gets a URL but no
    // file of its own.
    const component = componentFor(this.#featureOf(reflection), reflection);
    if (component && component.props !== reflection.name) {
      return false;
    }
    // @ts-expect-error -- `shouldWritePage` is private in the plugin's types (see the class)
    return super.shouldWritePage(reflection);
  }
}
