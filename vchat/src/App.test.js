import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from './Landing';

test('landing page shows start button linking to chat', () => {
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>
  );
  expect(
    screen.getByRole('link', { name: /start video chat/i })
  ).toHaveAttribute('href', '/chat');
});
