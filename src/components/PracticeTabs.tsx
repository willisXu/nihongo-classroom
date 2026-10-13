import { NavLink } from 'react-router-dom';
import { Icon } from './Icon';

/** 練習區的子分頁：假名測驗 / 手寫描字 / 五十音表 / 錯題本 */
export function PracticeTabs() {
  return (
    <nav className="ptabs" aria-label="練習方式">
      <NavLink to="/practice" className="ptab">
        <Icon name="target" size={17} /> 假名測驗
      </NavLink>
      <NavLink to="/writing" className="ptab">
        <Icon name="pencil" size={17} /> 手寫描字
      </NavLink>
      <NavLink to="/chart" className="ptab">
        <Icon name="grid" size={17} /> 五十音表
      </NavLink>
      <NavLink to="/mistakes" className="ptab">
        <Icon name="note" size={17} /> 錯題本
      </NavLink>
    </nav>
  );
}
