import { MemberRouter } from 'typedoc-plugin-markdown';
import {
  DeclarationReflection,
  ReflectionKind,
  Slugger,
  type PageDefinition,
  type ProjectReflection,
  type Reflection,
  type RouterTarget,
} from 'typedoc';

import {
  FEATURES,
  PAGE_GROUPS,
  type Component,
  type Feature,
  type PageGroup,
  anchorSlug,
  blockTagText,
  componentFor,
  linkTarget,
  membersOf,
  outputFile,
  outputRoot,
  parsePlatformTag,
} from './feature-map.mts';

/**
 * The `ios` / `android` props of a component section: the props type behind that key, whose
 * own props render after the section's as `ios.x` / `android.x`, in a part of their own.
 */
export interface PlatformProps {
  key: PageGroup;
  /**
   * The props type the key holds (`TabsHostPropsIOS`); not listed among the Types. It and the
   * key's prop both link to `#<section>-<key>` (`#host-ios`), the start of the part.
   */
  model: DeclarationReflection;
  /** The part's file, relative to the family's `api-reference/` (`host/_ios`). */
  part: string;
}

/**
 * The commands of a component section: the type the feature map names, which the component's
 * `ref` prop holds. They render in a part of their own after the section's props, and the type
 * is not listed among the Types. Its `ios` / `android` keys hold a commands type each; their
 * commands follow as `ios.x` / `android.x`, like a section's platform props.
 */
export interface Commands {
  /** The type the `ref` prop holds (`StackHeaderConfigRef`, `SplitHostCommands`). */
  model: DeclarationReflection;
  /** The part's file, relative to the family's `api-reference/` (`header-config/_commands`). */
  part: string;
  /** The commands types behind the model's `ios` / `android` keys, in `PAGE_GROUPS` order. */
  platforms: { key: PageGroup; model: DeclarationReflection }[];
}

/** One section of a family page: a component's props, or a type. */
export interface Section {
  kind: 'component' | 'type';
  model: DeclarationReflection;
  title: string;
  anchor: string;
  /** The section's file, relative to the family's `api-reference/` (set once routed). */
  part?: string;
  /** A component's flattened `ios` / `android` props, in `PAGE_GROUPS` order; `[]` for a type. */
  platforms: PlatformProps[];
  /** A component's commands, when the feature map names some. */
  commands?: Commands;
  /**
   * The components the section documents, as users write them (`Tabs.Host`); `[]` for a type.
   * Their `@platform` is the section's.
   */
  components: DeclarationReflection[];
}

/** A family page: its feature and its sections in page order. */
export interface Layout {
  feature: Feature;
  sections: Section[];
}

/**
 * Why a type cannot be shown as a list of commands, or `undefined`. The list is the type's own
 * members, so it needs some, and the members of a base it extends would be neither listed nor
 * linked.
 */
function commandsTypeProblem(type: DeclarationReflection): string | undefined {
  if (type.extendedTypes?.length) {
    return (
      `${type.name} extends another type, which a Commands block cannot show — ` +
      'write its commands out.'
    );
  }
  if (membersOf(type).length === 0) {
    return (
      `${type.name} has no members of its own — a commands type is an interface or ` +
      'an object type.'
    );
  }
  return undefined;
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

/**
 * Writes the reference into the docs tree the feature map describes, instead of TypeDoc's
 * own `<module>/<kind>/<name>` layout, and folds each family into ONE page assembled from
 * those files:
 *
 *   react/containers/stack/api-reference/
 *     _api-reference.mdx                          imports the parts below, in page order
 *     host/_host.mdx                              the Host section
 *     types/_StackHeaderTypeAndroid.mdx           one type per file
 *
 * `MemberRouter` is the plugin's public base class; `getIdealBaseName`, `shouldWritePage`
 * and `buildPages` are its documented extension points. Its types still mark
 * `shouldWritePage` as private, hence the two `@ts-expect-error`s.
 */
// @ts-expect-error -- `shouldWritePage` is private in the plugin's types (see above)
export class RnsRouter extends MemberRouter {
  /** page model → { feature, sections } */
  #layouts = new Map<RouterTarget, Layout>();
  /**
   * the `ios` / `android` props whose props, and the `ios` / `android` keys of a commands type
   * whose commands, are flattened into their section
   */
  #flattenedProps = new Set<RouterTarget>();
  /** the props types rendered as a component's section */
  #componentModels = new Set<RouterTarget>();
  /** members documented on a base's entry, not on their own type's */
  #inheritedMembers = new Set<RouterTarget>();

  /** The layout of the page this model renders, or `undefined` for anything else. */
  pageLayout(model: RouterTarget): Layout | undefined {
    return this.#layouts.get(model);
  }

  /** The doc that links on this page resolve against — the page, not the part file. */
  linkFileFor(model: RouterTarget): string | undefined {
    const layout = this.pageLayout(model);
    return layout
      ? `${linkTarget(layout.feature)}${this.extension}`
      : undefined;
  }

  /**
   * True for a component's `ios` / `android` prop, and for such a key of its commands type. It
   * renders no entry: its props follow the section's as `ios.x`, and its commands the commands
   * type's, each with its own `@platform`. The comments of the key and of the type it holds are
   * not rendered.
   */
  isFlattenedProp(model: RouterTarget): boolean {
    return this.#flattenedProps.has(model);
  }

  /** True for a component's props type, which renders as the component's section. */
  isComponentModel(model: RouterTarget): boolean {
    return this.#componentModels.has(model);
  }

  /**
   * True for a member a type inherits from a base that has an entry of its own. The member is
   * documented on the base's entry only, and links to it lead there.
   */
  isInheritedMember(model: RouterTarget): boolean {
    return this.#inheritedMembers.has(model);
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
    return `${root}/types/_${this.getReflectionAlias(reflection)}`;
  }

  override buildChildPages(
    reflection: Reflection,
    outPages: PageDefinition[],
  ): void {
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
    const pages = super
      .buildPages(project)
      .filter(page => page.model !== project);
    const byFeature = new Map<Feature, PageDefinition[]>();
    for (const page of pages) {
      // No module name finds no feature, same as an unknown name.
      const feature =
        FEATURES[moduleOf(page.model as Reflection)?.name as string];
      if (!feature) continue;
      byFeature.set(feature, [...(byFeature.get(feature) ?? []), page]);
    }

    // section model → the anchor its own heading and its members are prefixed with
    const anchors = new Map<RouterTarget, string>();
    const result: PageDefinition[] = [];

    for (const [feature, featurePages] of byFeature) {
      // The pages MemberRouter builds for a family are all declarations.
      const models = featurePages.map(
        page => page.model as DeclarationReflection,
      );
      const sections: Section[] = [];
      const sectionOf = new Map<Component, Section>();
      const flattened = new Set<DeclarationReflection>();
      // commands type → the component whose section shows it
      const commandsOwners = new Map<DeclarationReflection, Component>();

      for (const component of feature.components) {
        const model = models.find(
          candidate => candidate.name === component.props,
        );
        if (!model) {
          throw new Error(
            `[typedoc-rns] "${component.props}" (${feature.label}/${component.label}) is not ` +
              'in the public surface. Fix feature-map.mts or the library barrel.',
          );
        }
        anchors.set(model, component.id);
        this.#componentModels.add(model);

        // `ios` / `android` hold a props type of their own; its props join the section as
        // `ios.x`, anchored `host-ios-x`, and the type leaves the Types list. Links to the type
        // and to the prop resolve to `host-ios` (the type's anchor below; the prop is `host` +
        // `ios`), which the theme puts at the start of the part.
        const platforms: PlatformProps[] = [];
        for (const key of PAGE_GROUPS) {
          const prop = membersOf(model).find(member => member.name === key);
          if (!prop) continue;
          const target =
            prop.type?.type === 'reference'
              ? (prop.type.reflection as DeclarationReflection | undefined)
              : undefined;
          if (!target || !models.includes(target)) {
            // A library change stops the flattening. The error fails the run, but only after
            // the pages are written, with this prop left as a plain one.
            this.application.logger.error(
              `[typedoc-rns] ${feature.label}/${component.label}: \`${key}\` is not flattened — ` +
                'its type must be a plain reference to a type this family exports.',
            );
            continue;
          }
          flattened.add(target);
          this.#flattenedProps.add(prop);
          anchors.set(target, `${component.id}-${key}`);
          platforms.push({
            key,
            model: target,
            part: `${component.id}/_${key}`,
          });
        }

        // The commands type and the types behind its `ios` / `android` keys leave the Types list.
        // Links to them resolve to the block (`header-config-commands`) and to the start of each
        // key's group (`header-config-commands-ios`), which the theme anchors.
        const commands = this.#commandsOf(
          feature,
          component,
          model,
          models,
          commandsOwners,
        );
        if (commands) {
          flattened.add(commands.model);
          anchors.set(commands.model, `${component.id}-commands`);
          for (const platform of commands.platforms) {
            flattened.add(platform.model);
            anchors.set(
              platform.model,
              `${component.id}-commands-${platform.key}`,
            );
          }
        }

        const section: Section = {
          kind: 'component',
          model,
          title: component.label,
          anchor: component.id,
          platforms,
          commands,
          components: [],
        };
        sections.push(section);
        sectionOf.set(component, section);
      }

      const componentModels = new Set(sections.map(section => section.model));
      const types = models
        .filter(model => !componentModels.has(model) && !flattened.has(model))
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const model of types) {
        anchors.set(model, anchorSlug(model.name));
        sections.push({
          kind: 'type',
          model,
          title: model.name,
          anchor: anchorSlug(model.name),
          platforms: [],
          components: [],
        });
      }

      // A merged reflection resolves onto the section it documents in.
      visitReflections(moduleOf(models[0]), reflection => {
        const component = componentFor(feature, reflection);
        if (component && reflection.name !== component.props) {
          anchors.set(reflection, component.id);
          if (
            reflection instanceof DeclarationReflection &&
            reflection.kindOf(ReflectionKind.Variable | ReflectionKind.Function)
          ) {
            sectionOf.get(component)!.components.push(reflection);
          }
        }
      });
      // One section shows one set of platform chips. The tags are compared as parsed entries,
      // so spacing and the order of the platforms do not make two tags differ.
      for (const [component, section] of sectionOf) {
        const tags = new Set(
          section.components.map(reflection =>
            JSON.stringify(
              parsePlatformTag(
                blockTagText(reflection, '@platform') ?? '',
              ).entries.sort((a, b) => a.platform.localeCompare(b.platform)),
            ),
          ),
        );
        if (tags.size > 1) {
          this.application.logger.error(
            `[typedoc-rns] ${feature.label}/${component.label}: its components give different ` +
              '@platform tags, but share one section.',
          );
        }
      }

      const root = outputRoot(feature);
      for (const section of sections) {
        section.part = this.getIdealBaseName(section.model).slice(
          root.length + 1,
        );
      }

      const pageModel = sections[0]!.model;
      this.#layouts.set(pageModel, { feature, sections });
      result.push({
        ...featurePages.find(page => page.model === pageModel)!,
        url: `${outputFile(feature)}${this.extension}`,
      });
    }

    this.#rewriteUrls(anchors);
    this.#routeInheritedMembers();
    return result;
  }

  /**
   * The commands the feature map gives a component, checked against its `ref` prop, which must
   * hold the type as `Ref<…>`. The type's `ios` / `android` keys are flattened: their commands
   * types join the block, and the keys render nothing, like a section's `ios` / `android` props.
   * Anything the block could not show in full is reported as an error, which fails the run once
   * the pages are written; the type then stays among the Types, or the key a plain member. A
   * type shown here is recorded in `owners`, so another component cannot claim it too.
   */
  #commandsOf(
    feature: Feature,
    component: Component,
    model: DeclarationReflection,
    models: DeclarationReflection[],
    owners: Map<DeclarationReflection, Component>,
  ): Commands | undefined {
    if (!component.commands) return undefined;
    const report = (problem: string): undefined => {
      this.application.logger.error(
        `[typedoc-rns] ${feature.label}/${component.label}: ${problem}`,
      );
      return undefined;
    };

    const target = models.find(
      candidate => candidate.name === component.commands,
    );
    if (!target) {
      return report(
        `its commands type ${component.commands} is not a type this family exports. ` +
          'Fix feature-map.mts or the library barrel.',
      );
    }
    // A second block for one type would repeat its anchors, and links could reach only one.
    const owner = owners.get(target);
    if (owner) {
      return report(
        `its commands type ${target.name} is already ${owner.label}'s — a commands type ` +
          'belongs to one component.',
      );
    }
    // Compared by qualified name: the displayed name follows the source's spelling (`Ref` or
    // `React.Ref`).
    const ref = membersOf(model).find(member => member.name === 'ref')?.type;
    const argument =
      ref?.type === 'reference' &&
      ref.qualifiedName === 'React.Ref' &&
      ref.package === '@types/react'
        ? ref.typeArguments?.[0]
        : undefined;
    if (argument?.type !== 'reference' || argument.reflection !== target) {
      return report(
        `its \`ref\` prop must be \`Ref<${target.name}>\` to show ${target.name} as its commands.`,
      );
    }
    // The block's anchor is the section's plus `commands`, the anchor such a prop would have.
    if (membersOf(model).some(member => member.name === 'commands')) {
      return report(
        'a prop named `commands` takes the anchor of the Commands block.',
      );
    }
    const problem = commandsTypeProblem(target);
    if (problem) return report(problem);

    const platforms: Commands['platforms'] = [];
    for (const key of PAGE_GROUPS) {
      const member = membersOf(target).find(child => child.name === key);
      if (!member) continue;
      const holds =
        member.type?.type === 'reference'
          ? (member.type.reflection as DeclarationReflection | undefined)
          : undefined;
      if (!holds || !models.includes(holds)) {
        report(
          `\`${target.name}.${key}\` is not flattened — its type must be a plain reference to a ` +
            'type this family exports.',
        );
        continue;
      }
      const keyProblem = commandsTypeProblem(holds);
      if (keyProblem) {
        report(keyProblem);
        continue;
      }
      this.#flattenedProps.add(member);
      platforms.push({ key, model: holds });
    }
    owners.set(target, component);
    return { model: target, part: `${component.id}/_commands`, platforms };
  }

  /** The member that documents this one: itself, or the base member it inherits. */
  #documentingMember(member: DeclarationReflection): DeclarationReflection {
    const origin = member.inheritedFrom?.reflection;
    if (
      !(origin instanceof DeclarationReflection) ||
      !origin.parent ||
      !member.parent ||
      !this.hasUrl(origin) ||
      this.getFullUrl(origin.parent) === this.getFullUrl(member.parent)
    ) {
      return member;
    }
    return this.#documentingMember(origin);
  }

  /**
   * A member inherited from a base with an entry of its own takes the base member's URL. A
   * base merged into the entry, the way a component's `XPropsBase` is into its section, has
   * the entry's URL, so its members stay.
   */
  #routeInheritedMembers(): void {
    for (const reflection of [...this.fullUrls.keys()]) {
      if (!(reflection instanceof DeclarationReflection)) continue;
      const target = this.#documentingMember(reflection);
      if (target === reflection) continue;
      this.fullUrls.set(reflection, this.getFullUrl(target));
      const anchor = this.getAnchor(target);
      if (anchor) this.anchors.set(reflection, anchor);
      else this.anchors.delete(reflection);
      this.#inheritedMembers.add(reflection);
    }
  }

  /**
   * Everything a family declares now lives on one page, so every URL becomes that page's
   * URL plus an anchor, and every member's anchor is prefixed with its section's — without
   * it, `title` of one type and `title` of the next would collide.
   */
  #rewriteUrls(anchors: Map<RouterTarget, string>): void {
    for (const reflection of [...this.fullUrls.keys()]) {
      const feature =
        FEATURES[moduleOf(reflection as Reflection)?.name as string];
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

  override shouldWritePage(reflection: Reflection): boolean {
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
