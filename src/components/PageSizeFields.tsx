import { setPageSize } from '../pageSize';
import { useProject } from '../store';
import { NumberField } from './NumberField';

/** Page width × height in inches. Used in Settings and on a new project's empty desk. */
export function PageSizeFields() {
  const { project } = useProject();
  return (
    <div className="inline">
      <NumberField
        label="W"
        min={1}
        suffix=""
        commitOnBlur
        value={project.settings.pageW}
        onCommit={(n) => setPageSize('pageW', n)}
      />
      <NumberField
        label="H"
        min={1}
        suffix=""
        commitOnBlur
        value={project.settings.pageH}
        onCommit={(n) => setPageSize('pageH', n)}
      />
      <span className="muted data">in</span>
    </div>
  );
}
