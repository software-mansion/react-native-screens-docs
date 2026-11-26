import React from 'react';
import styles from './styles.module.css';
import { useLayoutDoc } from '@docusaurus/plugin-content-docs/client';
import HomepageButton from '@site/src/components/HomepageButton';

const START_DOC_ID = 'react/containers/stack/index';

const StartScreen = () => {
  // The Stack page of the version last picked in the dropdown, or of the latest one, as the
  // navbar's "Docs" link; each version has its own path, `/docs/5.x/…`.
  const start = useLayoutDoc(START_DOC_ID)!.path;
  return (
    <section className={styles.hero}>
      <div className={styles.heading}>
        <div>
          <h1 className={styles.headingLabel}>
            <span>React Native</span>
            <span>Screens</span>
          </h1>
          <h2 className={styles.subheadingLabel}>
            Native Navigation primitives for your React Native app.
          </h2>
        </div>
        <div className={styles.buttonContainer}>
          <HomepageButton href={start} title="Learn more" />
        </div>
      </div>
    </section>
  );
};

export default StartScreen;
